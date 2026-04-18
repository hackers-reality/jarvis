# ─── J.A.R.V.I.S. Docker Image ──────────────────────────────────────
#
# Multi-stage build for the JARVIS daemon.
# Uses Debian-based Bun images (not Alpine) for sharp glibc compatibility.
#
# Build:   docker build -t jarvis .
# Build with version: docker build --build-arg VERSION=0.3.1 -t jarvis .
# Run:     docker run -p 3142:3142 --add-host=host.docker.internal:host-gateway -v jarvis-data:/data jarvis
# Note:    Browser history and desktop control are routed via the Sidecar on host.docker.internal.
#
# ─────────────────────────────────────────────────────────────────────

# Build arg: pass the release version (e.g. 0.3.1) to stamp package.json
ARG VERSION

# ─── Stage 1: Install dependencies ─────────────────────────────────
FROM oven/bun:1.1.27 AS deps

WORKDIR /app

# Copy only dependency manifests for layer caching
COPY package.json bun.lock ./
# scripts/ holds the postinstall helper (ensure-bun.cjs) referenced by package.json
COPY scripts/ scripts/

# Install all dependencies (includes devDependencies needed for UI build)
RUN bun install --frozen-lockfile

# ─── Stage 2: Build UI and copy models ─────────────────────────────
FROM deps AS build

WORKDIR /app

# Copy source files needed for the build
COPY src/ src/
COPY ui/ ui/
COPY bin/ bin/
COPY roles/ roles/
COPY scripts/ scripts/
COPY tsconfig.json ./

# Stamp release version into package.json if provided
ARG VERSION
RUN if [ -n "$VERSION" ]; then \
      bunx npm version "$VERSION" --no-git-tag-version --allow-same-version; \
    fi

# Copy ONNX wake-word models and WASM runtime from node_modules into ui/public/
RUN mkdir -p ui/public/openwakeword/models ui/public/ort && \
    cp node_modules/openwakeword-wasm-browser/models/melspectrogram.onnx \
       node_modules/openwakeword-wasm-browser/models/embedding_model.onnx \
       node_modules/openwakeword-wasm-browser/models/silero_vad.onnx \
       node_modules/openwakeword-wasm-browser/models/hey_jarvis_v0.1.onnx \
       ui/public/openwakeword/models/ && \
    cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm \
       node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm \
       node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs \
       node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs \
       ui/public/ort/

# Build the dashboard UI bundle
RUN bun build ui/index.html --outdir ui/dist

# ─── Stage 3: Production image ─────────────────────────────────────
FROM oven/bun:1.1.27-slim AS production

# ca-certificates: HTTPS calls to LLM APIs
# git: required by the Site Builder for project version control
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates git make procps libc-dev libsqlite3-dev util-linux && \
    rm -rf /var/lib/apt/lists/*


WORKDIR /app

# Copy installed dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy application source and built assets
COPY --from=build /app/src ./src
COPY --from=build /app/bin ./bin
COPY --from=build /app/roles ./roles
COPY --from=build /app/webapp-templates ./webapp-templates
COPY --from=build /app/ui/dist ./ui/dist
COPY --from=build /app/ui/public ./ui/public
# Copy version-stamped package.json from build stage (not the original)
COPY --from=build /app/package.json ./
COPY tsconfig.json ./
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Install jarvis as a global command
# Note: `bun link` can't be used here — it symlinks through /root/.bun/ which
# is inaccessible to the non-root jarvis user. Direct symlink works because
# Bun resolves import.meta.dir through symlinks to the real path (/app/bin).
RUN ln -s /app/bin/jarvis.ts /usr/local/bin/jarvis

# Create non-root user and data directory
RUN groupadd -r jarvis && useradd -r -g jarvis -d /data -s /bin/bash jarvis && \
    mkdir -p /data && chown jarvis:jarvis /data

ENV JARVIS_HOME=/data
ENV NODE_ENV=production

EXPOSE 3142

VOLUME ["/data"]

# Entrypoint handles permission fixes on mounted volumes
ENTRYPOINT ["/app/entrypoint.sh"]
# Use host.docker.internal to reach the host Sidecar for Zero-Mount intelligence
CMD ["start", "--no-open", "--data-dir", "/data", "--no-local-tools"]
