#!/bin/bash
set -e

# JARVIS Permission Refiner
# Ensures that the /data volume is writable by the jarvis user (UID 1000)
# even when host-mounted from systems with different permission models (Windows/macOS).

echo "[Entrypoint] Refining filesystem permissions for /data..."

# Ensure .jarvis directory exists
mkdir -p /data/.jarvis

# Fix ownership of the data volume at runtime. 
# We do this as root before dropping privileges.
chown -R jarvis:jarvis /data

echo "[Entrypoint] Permissions refined. Dropping privileges to 'jarvis' user."

# Execute the main JARVIS daemon as the jarvis user
exec runuser -u jarvis -- jarvis "$@"
