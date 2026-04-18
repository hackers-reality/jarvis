import React from "react";

/**
 * TypingIndicator — A living waveform to show Friday is thinking/typing.
 */
export function TypingIndicator() {
  return (
    <div className="chat-typing-wrap">
      <div className="chat-typing-inner">
        <div className="chat-waveform">
          <div className="chat-wave-bar" style={{ "--dur": "0.8s", "--delay": "0s", "--wave-min": "4px", "--wave-max": "14px", background: "var(--violet)" } as React.CSSProperties} />
          <div className="chat-wave-bar" style={{ "--dur": "1.0s", "--delay": "0.2s", "--wave-min": "6px", "--wave-max": "20px", background: "var(--violet-bright)" } as React.CSSProperties} />
          <div className="chat-wave-bar" style={{ "--dur": "0.9s", "--delay": "0.4s", "--wave-min": "4px", "--wave-max": "12px", background: "var(--violet)" } as React.CSSProperties} />
        </div>
        <div className="chat-typing-text">FRIDAY IS THINKING...</div>
      </div>
    </div>
  );
}
