import { useNavigate } from "react-router-dom";
import { useWallet } from "../contexts/WalletContext";
import { useToast } from "./Toast";

export function LandingPage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { connectWallet, isConnecting } = useWallet();

  const handleConnect = async () => {
    try {
      const address = await connectWallet();
      showToast({
        type: "success",
        message: `钱包已连接：${address.slice(0, 6)}...${address.slice(-4)}`,
      });
      navigate("/dashboard", { replace: true });
    } catch (e: unknown) {
      const err = e as { message?: string };
      showToast({ type: "error", message: err.message ?? "连接钱包失败" });
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#0a0e17",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Grid background */}
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `
          linear-gradient(rgba(0,255,255,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(0,255,255,0.03) 1px, transparent 1px)
        `,
        backgroundSize: "40px 40px",
      }} />

      {/* Gradient glow at top */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: "linear-gradient(90deg, #00ffff, #00ff88, #8b5cf6, #00ffff)",
      }} />

      {/* Ambient glow behind card */}
      <div style={{
        position: "absolute",
        width: 500, height: 500,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,200,255,0.06) 0%, transparent 70%)",
        filter: "blur(60px)",
        transform: "translate(-50%, -50%)",
      }} />

      {/* Card */}
      <div style={{
        position: "relative", zIndex: 1,
        textAlign: "center",
        maxWidth: 460,
        padding: "60px 40px",
      }}>
        {/* Hexagon Shield Icon */}
        <div style={{
          width: 96, height: 96,
          margin: "0 auto 32px",
          position: "relative",
        }}>
          <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
            <defs>
              <linearGradient id="hexGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00ffff" />
                <stop offset="100%" stopColor="#00ff88" />
              </linearGradient>
            </defs>
            <polygon points="50,4 93,27 93,73 50,96 7,73 7,27"
              fill="url(#hexGrad)" opacity="0.1" stroke="url(#hexGrad)" strokeWidth="2"/>
            <path d="M38 50 L46 58 L64 40" stroke="url(#hexGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <circle cx="50" cy="50" r="32" stroke="url(#hexGrad)" strokeWidth="1" opacity="0.3"/>
          </svg>
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: 42,
          fontWeight: 700,
          color: "#e1e4e8",
          letterSpacing: 6,
          fontFamily: "'Courier New', monospace",
          marginBottom: 8,
        }}>
          SENTINEL
        </h1>
        <p style={{
          fontSize: 12,
          letterSpacing: 4,
          color: "#00ffff",
          textTransform: "uppercase",
          marginBottom: 32,
          fontFamily: "'Courier New', monospace",
        }}>
          — DEFI SECURITY —
        </p>

        {/* Tagline */}
        <p style={{
          fontSize: 20,
          color: "#8b949e",
          marginBottom: 8,
          fontFamily: "'Courier New', monospace",
          letterSpacing: 1,
        }}>
          Don{''}t trade <span style={{ color: "#f85149", fontWeight: 600 }}>naked</span>.
        </p>
        <p style={{
          fontSize: 14,
          color: "#484f58",
          marginBottom: 48,
          lineHeight: 1.6,
        }}>
          Every route analyzed. Every contract scored.
        </p>

        {/* Connect Wallet Button */}
        <button
          onClick={handleConnect}
          disabled={isConnecting}
          style={{
            width: "100%",
            padding: "16px 24px",
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: 3,
            fontFamily: "'Courier New', monospace",
            color: isConnecting ? "#484f58" : "#00ffff",
            background: isConnecting ? "transparent" : "rgba(0,255,255,0.06)",
            border: `1px solid ${isConnecting ? "#30363d" : "#00ffff44"}`,
            borderRadius: 4,
            cursor: isConnecting ? "not-allowed" : "pointer",
            transition: "all 0.3s ease",
            boxShadow: isConnecting ? "none" : "0 0 20px rgba(0,255,255,0.1), inset 0 0 20px rgba(0,255,255,0.03)",
          }}
          onMouseEnter={(e) => {
            if (!isConnecting) {
              e.currentTarget.style.background = "rgba(0,255,255,0.12)";
              e.currentTarget.style.boxShadow = "0 0 30px rgba(0,255,255,0.2), inset 0 0 30px rgba(0,255,255,0.05)";
            }
          }}
          onMouseLeave={(e) => {
            if (!isConnecting) {
              e.currentTarget.style.background = "rgba(0,255,255,0.06)";
              e.currentTarget.style.boxShadow = "0 0 20px rgba(0,255,255,0.1), inset 0 0 20px rgba(0,255,255,0.03)";
            }
          }}
        >
          {isConnecting ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
              <span style={{
                display: "inline-block",
                width: 16, height: 16,
                border: "2px solid #484f58",
                borderTopColor: "#00ffff",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }} />
              CONNECTING...
            </span>
          ) : (
            <>
              <span style={{ marginRight: 8 }}>⬡</span>
              CONNECT WALLET
            </>
          )}
        </button>

        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
