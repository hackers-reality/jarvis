import React, { useState, useEffect, useCallback } from "react";
import { useApiData, api } from "../../hooks/useApi";

type SpotifyStatus = {
  status: "not_configured" | "credentials_saved" | "connected";
  has_credentials: boolean;
  is_authenticated: boolean;
};

export function SpotifyPanel() {
  const { data: sStatus, loading, refetch } = useApiData<SpotifyStatus>(
    "/api/auth/spotify/status",
    []
  );
  const [phase, setPhase] = useState<"idle" | "saving" | "authenticating">("idle");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Clear messages after 5s
  useEffect(() => {
    if (!errorMsg && !successMsg) return;
    const t = setTimeout(() => {
      setErrorMsg("");
      setSuccessMsg("");
    }, 5000);
    return () => clearTimeout(t);
  }, [errorMsg, successMsg]);

  const handleMessage = useCallback((event: MessageEvent) => {
    if (event.data === "spotify-auth-complete") {
      setPhase("idle");
      setSuccessMsg("Spotify connected!");
      refetch();
    }
  }, [refetch]);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  const handleSave = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setErrorMsg("Client ID and Secret are required.");
      return;
    }
    setPhase("saving");
    try {
      await api("/api/config/spotify", {
        method: "POST",
        body: JSON.stringify({
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
        }),
      });
      setSuccessMsg("Spotify credentials saved.");
      setClientId("");
      setClientSecret("");
      refetch();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setPhase("idle");
    }
  };

  const handleConnect = async () => {
    setErrorMsg("");
    try {
      const resp = await api<{ auth_url: string }>("/api/auth/spotify/init", {
        method: "POST"
      });
      setPhase("authenticating");
      window.open(resp.auth_url, "spotify-auth", "width=600,height=700");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to start auth");
    }
  };

  const handleManualSubmit = async () => {
    if (!manualCode.trim()) return;
    setPhase("saving");
    try {
      await api("/api/auth/spotify/manual", {
        method: "POST",
        body: JSON.stringify({ codeOrUrl: manualCode.trim() })
      });
      setSuccessMsg("Authorized manually!");
      setManualCode("");
      setShowManual(false);
      refetch();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Manual auth failed");
    } finally {
      setPhase("idle");
    }
  };

  if (loading || !sStatus) return <div style={glassCardStyle}>Loading Spotify...</div>;

  return (
    <div style={{ ...glassCardStyle, marginTop: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <h3 style={headerStyle}>Spotify Integration</h3>
        <StatusDot color={sStatus.is_authenticated ? "#1DB954" : sStatus.has_credentials ? "#F59E0B" : "rgba(255,255,255,0.2)"} pulse={phase === "authenticating"} />
      </div>

      {errorMsg && (
        <div style={{ ...msgStyle, background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", color: "#EF4444" }}>
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div style={{ ...msgStyle, background: "rgba(29, 185, 84, 0.1)", border: "1px solid rgba(29, 185, 84, 0.2)", color: "#1DB954" }}>
          {successMsg}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {sStatus.status === "not_configured" && (
          <>
            <div style={setupStepsStyle}>
              <div style={labelStyle}>SETUP GUIDE</div>
              <ul style={{ margin: "8px 0 0 0", paddingLeft: "18px", fontSize: "11px", color: "rgba(255,255,255,0.5)", lineHeight: 1.6 }}>
                <li>Visit the <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer" style={{ color: "#1DB954" }}>Spotify Dashboard</a></li>
                <li>Create an app and enable <strong>Web API</strong></li>
                <li>Redirect URI: <code style={codeStyle}>http://localhost:3142/api/auth/spotify/callback</code></li>
              </ul>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
               <input
                style={inputStyle}
                type="text"
                placeholder="Client ID"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              />
              <input
                style={inputStyle}
                type="password"
                placeholder="Client Secret"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
              />
              <button style={{ ...primaryBtnStyle, background: "linear-gradient(135deg, #1DB954 0%, #191414 100%)", boxShadow: "0 4px 12px rgba(29, 185, 84, 0.2)" }} onClick={handleSave}>
                Save Spotify Credentials
              </button>
            </div>
          </>
        )}

        {sStatus.status === "credentials_saved" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)", textAlign: "center" }}>
              Credentials saved. Authenticate your account to enable playback control.
            </div>
            
            <button style={{ ...primaryBtnStyle, background: "#1DB954", color: "#000" }} onClick={handleConnect}>
              Connect Spotify Account
            </button>

            <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", pt: "10px", marginTop: "10px" }}>
              <button 
                onClick={() => setShowManual(!showManual)}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: "11px", cursor: "pointer", textDecoration: "underline" }}
              >
                {showManual ? "Hide Manual Flow" : "Redirect not working? Authorize manually"}
              </button>

              {showManual && (
                <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                   <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>
                      If Spotify blocks your redirect, authorize anyway, then copy the <strong>entire URL</strong> or the <strong>code=...</strong> part from your browser and paste it here:
                   </div>
                   <input 
                    style={inputStyle}
                    placeholder="Paste URL or code here..."
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                   />
                   <button style={secondaryBtnStyle} onClick={handleManualSubmit}>
                      Submit Code
                   </button>
                </div>
              )}
            </div>
          </div>
        )}

        {sStatus.status === "connected" && (
          <div style={serviceCardStyle}>
             <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ color: "#fff", fontSize: "14px", fontWeight: 600 }}>Spotify Connected</span>
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>Playback tools enabled</span>
             </div>
             <button style={dangerBtnStyle} onClick={() => api("/api/config/spotify/reset", { method: "POST" }).then(() => refetch())}>Disconnect</button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusDot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, zIndex: 2 }} />
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

// Styles (shared with IntegrationsPanel for consistency)
const glassCardStyle: React.CSSProperties = {
  padding: "24px",
  background: "rgba(255, 255, 255, 0.04)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "16px",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
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
  boxSizing: "border-box",
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "12px 24px",
  border: "none",
  borderRadius: "10px",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
  transition: "transform 0.2s",
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "rgba(255,255,255,0.1)",
  border: "none",
  borderRadius: "10px",
  fontSize: "12px",
  fontWeight: 600,
  color: "#fff",
  cursor: "pointer",
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

const codeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 6px",
  background: "rgba(0,0,0,0.3)",
  borderRadius: "4px",
  fontSize: "10px",
  color: "#1DB954",
  fontFamily: "monospace",
};

const serviceCardStyle: React.CSSProperties = {
  padding: "16px",
  background: "rgba(29, 185, 84, 0.05)",
  border: "1px solid rgba(29, 185, 84, 0.1)",
  borderRadius: "12px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};
