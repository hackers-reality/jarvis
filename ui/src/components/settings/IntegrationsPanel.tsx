import React, { useState, useEffect, useRef, useCallback } from "react";
import { useApiData, api } from "../../hooks/useApi";

type GoogleStatus = {
  status: "not_configured" | "credentials_saved" | "connected";
  has_credentials: boolean;
  is_authenticated: boolean;
  scopes: string[];
  token_expiry: number | null;
};

export function IntegrationsPanel() {
  const { data: gStatus, loading, refetch } = useApiData<GoogleStatus>(
    "/api/auth/google/status",
    []
  );
  const [phase, setPhase] = useState<"idle" | "saving" | "authenticating">(
    "idle"
  );
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [selectedScopes, setSelectedScopes] = useState({
    gmail: true,
    calendar: true,
    drive: false,
  });
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const pollRef = useRef<Timer | null>(null);

  // Clear messages after 5s
  useEffect(() => {
    if (!errorMsg && !successMsg) return;
    const t = setTimeout(() => {
      setErrorMsg("");
      setSuccessMsg("");
    }, 5000);
    return () => clearTimeout(t);
  }, [errorMsg, successMsg]);

  // Listen for postMessage from OAuth callback popup
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (event.data === "google-auth-complete") {
        setPhase("idle");
        setSuccessMsg("Connected! Restart JARVIS to activate your Google services.");
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        refetch();
      }
    },
    [refetch]
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  const handleSaveCredentials = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setErrorMsg("Both Client ID and Client Secret are required.");
      return;
    }
    setPhase("saving");
    try {
      await api("/api/config/google", {
        method: "POST",
        body: JSON.stringify({
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
        }),
      });
      setClientId("");
      setClientSecret("");
      setSuccessMsg("Credentials saved.");
      refetch();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setPhase("idle");
    }
  };

  const handleConnect = async () => {
    setErrorMsg("");
    try {
      const activeScopes = Object.entries(selectedScopes)
        .filter(([_, active]) => active)
        .map(([name]) => name);

      if (activeScopes.length === 0) {
        setErrorMsg("Please select at least one permission.");
        return;
      }

      const resp = await api<{ auth_url: string }>("/api/auth/google/init", {
        method: "POST",
        body: JSON.stringify({ scopes: activeScopes }),
      });
      setPhase("authenticating");

      window.open(resp.auth_url, "google-auth", "width=600,height=700");

      pollRef.current = setInterval(async () => {
        try {
          const status = await api<GoogleStatus>("/api/auth/google/status");
          if (status.is_authenticated) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setPhase("idle");
            setSuccessMsg("Connected! Restart JARVIS to apply changes.");
            refetch();
          }
        } catch {}
      }, 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to start auth");
    }
  };

  const handleDisconnect = async () => {
    setErrorMsg("");
    try {
      await api("/api/auth/google/disconnect", { method: "POST" });
      setSuccessMsg("Disconnected.");
      refetch();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to disconnect");
    }
  };

  if (loading || !gStatus) return <div style={glassCardStyle}>Loading Google Integration...</div>;

  return (
    <div style={glassCardStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <h3 style={headerStyle}>Google Workspace</h3>
        <StatusDot color={gStatus.is_authenticated ? "#10B981" : gStatus.has_credentials ? "#F59E0B" : "rgba(255,255,255,0.2)"} pulse={phase !== "idle"} />
      </div>

      {errorMsg && (
        <div style={{ ...msgStyle, background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", color: "#EF4444" }}>
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div style={{ ...msgStyle, background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.2)", color: "#10B981" }}>
          {successMsg}
        </div>
      )}

      {/* Configuration Form */}
      {gStatus.status === "not_configured" && phase !== "saving" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ fontSize: "12px", color: "var(--j-text-dim)", lineHeight: 1.6 }}>
            Connect JARVIS to your Google account by providing a <strong>Client ID</strong> and <strong>Client Secret</strong> from the 
            <a href="https://console.cloud.google.com/" target="_blank" rel="noreferrer" style={{ color: "var(--j-accent)", marginLeft: "4px" }}>Google Cloud Console</a>.
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={labelStyle}>CLIENT ID</div>
            <input
              style={inputStyle}
              type="text"
              placeholder="000000000000-xxx.apps.googleusercontent.com"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={labelStyle}>CLIENT SECRET</div>
            <input
              style={inputStyle}
              type="password"
              placeholder="GOCSPX-xxxxxxxxxxxx"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
            />
          </div>

          <button style={primaryBtnStyle} onClick={handleSaveCredentials} disabled={phase === "saving"}>
            {phase === "saving" ? "Saving..." : "Save Credentials"}
          </button>
        </div>
      )}

      {/* Permission Wizard & Connection */}
      {gStatus.status === "credentials_saved" && phase === "idle" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={setupStepsStyle}>
            <div style={labelStyle}>SELECT PERMISSIONS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "12px" }}>
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  style={checkboxStyle}
                  checked={selectedScopes.gmail}
                  onChange={(e) => setSelectedScopes({ ...selectedScopes, gmail: e.target.checked })}
                />
                <span style={{ cursor: "pointer" }}>Gmail (Read)</span>
              </label>
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  style={checkboxStyle}
                  checked={selectedScopes.calendar}
                  onChange={(e) => setSelectedScopes({ ...selectedScopes, calendar: e.target.checked })}
                />
                <span style={{ cursor: "pointer" }}>Calendar</span>
              </label>
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  style={checkboxStyle}
                  checked={selectedScopes.drive}
                  onChange={(e) => setSelectedScopes({ ...selectedScopes, drive: e.target.checked })}
                />
                <span style={{ cursor: "pointer" }}>Drive (Read)</span>
              </label>
            </div>
          </div>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
             <button style={primaryBtnStyle} onClick={handleConnect}>
                Authorize JARVIS
             </button>
             <button style={{ ...secondaryBtnStyle, color: "var(--j-error)" }} onClick={() => api("/api/config/google/reset", { method: "POST" }).then(() => refetch())}>
                Reset Credentials
             </button>
          </div>
        </div>
      )}

      {/* Connected State */}
      {gStatus.status === "connected" && phase === "idle" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={serviceCardStyle}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ color: "var(--j-text)", fontSize: "14px", fontWeight: 600 }}>Account Connected</span>
                <span style={{ fontSize: "11px", color: "var(--j-text-muted)", letterSpacing: "0.5px" }}>
                   SCOPES: {activeScopesLabel(gStatus.scopes)}
                </span>
              </div>
              <button style={dangerBtnStyle} onClick={handleDisconnect}>Disconnect</button>
          </div>
          
          <div style={{ 
            fontSize: "11px", 
            color: "var(--j-text-dim)", 
            padding: "10px", 
            background: "rgba(255,255,255,0.03)", 
            borderRadius: "6px",
            border: "1px solid rgba(255,255,255,0.05)"
          }}>
            JARVIS is now utilizing your Google Workspace data to provide context-aware assistance.
          </div>
        </div>
      )}
    </div>
  );
}

function activeScopesLabel(scopes: string[]) {
  return scopes.map(s => {
    if (s.includes("gmail")) return "GMAIL";
    if (s.includes("calendar")) return "CALENDAR";
    if (s.includes("drive")) return "DRIVE";
    return s.split("/").pop();
  }).filter(Boolean).join(", ") || "NONE";
}

function StatusDot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{
        width: "8px", height: "8px", borderRadius: "50%", background: color,
        zIndex: 2,
      }} />
      {pulse && (
        <span style={{
          position: "absolute",
          width: "16px", height: "16px", borderRadius: "50%", background: color,
          opacity: 0.4,
          animation: "pulse-ring 1.5s cubic-bezier(0.24, 0, 0.38, 1) infinite",
        }} />
      )}
    </div>
  );
}

// --- Premium Styles ---

const glassCardStyle: React.CSSProperties = {
  padding: "24px",
  background: "rgba(255, 255, 255, 0.04)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "16px",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
  transition: "transform 0.3s ease, box-shadow 0.3s ease",
};

const headerStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 700,
  color: "#fff",
  margin: 0,
  letterSpacing: "-0.02em",
};

const labelStyle: React.CSSProperties = {
  fontSize: "10px",
  fontWeight: 800,
  color: "rgba(255,255,255,0.4)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const msgStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: "8px",
  fontSize: "13px",
  marginBottom: "20px",
  display: "flex",
  alignItems: "center",
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  background: "rgba(0,0,0,0.2)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "10px",
  color: "#fff",
  fontSize: "14px",
  outline: "none",
  transition: "border-color 0.2s, box-shadow 0.2s",
  boxSizing: "border-box",
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "12px 24px",
  background: "linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)",
  color: "#fff",
  border: "none",
  borderRadius: "10px",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "0 4px 12px rgba(79, 70, 229, 0.3)",
  transition: "transform 0.2s, box-shadow 0.2s",
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "transparent",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: "10px",
  fontSize: "12px",
  fontWeight: 500,
  cursor: "pointer",
  transition: "background 0.2s",
};

const dangerBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  background: "rgba(239, 68, 68, 0.1)",
  color: "#EF4444",
  border: "1px solid rgba(239, 68, 68, 0.2)",
  borderRadius: "8px",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
};

const setupStepsStyle: React.CSSProperties = {
  padding: "16px",
  background: "rgba(0,0,0,0.1)",
  border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: "12px",
};

const checkboxLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  fontSize: "13px",
  color: "rgba(255,255,255,0.8)",
  cursor: "pointer",
};

const checkboxStyle: React.CSSProperties = {
  width: "16px",
  height: "16px",
  borderRadius: "4px",
  accentColor: "#6366F1",
  margin: 0,
};

const serviceCardStyle: React.CSSProperties = {
  padding: "16px",
  background: "rgba(16, 185, 129, 0.05)",
  border: "1px solid rgba(16, 185, 129, 0.1)",
  borderRadius: "12px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};
