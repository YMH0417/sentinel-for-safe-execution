import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface Props {
  children: React.ReactNode;
}

// ---- Minimal local-synced account store ----

const STORE_KEY = "__sentinel_account__";

export function getAccountSync(): string | null {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

export function setAccountSync(account: string | null) {
  try {
    if (account) {
      localStorage.setItem(STORE_KEY, account);
    } else {
      localStorage.removeItem(STORE_KEY);
    }
  } catch { /* ignore */ }
}

/**
 * AuthRoute: if no wallet connected → immediately redirect to /.
 */
export function AuthRoute({ children }: Props) {
  const navigate = useNavigate();

  const [account] = React.useState<string | null>(() => getAccountSync());

  // Navigate away if disconnected
  useEffect(() => {
    if (!account) {
      navigate("/", { replace: true });
    }
  }, [account, navigate]);

  // Not authenticated — render nothing (redirect is in flight)
  if (!account) return null;

  return <>{children}</>;
}

// ---- Tiny Avatar wrapper for the header ----
export function HeaderAvatar() {
  const [showDropdown, setShowDropdown] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [account, setAccountState] = React.useState<string | null>(() => getAccountSync());

  React.useEffect(() => {
    const handler = () => {
      setAccountSync(null);
      setAccountState(null);
      navigate("/", { replace: true });
    };
    window.addEventListener("wallet:disconnect", handler);
    return () => window.removeEventListener("wallet:disconnect", handler);
  }, [navigate]);

  React.useEffect(() => {
    if (!account) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [account]);

  if (!account) return null;

  const shortAddr = `${account.slice(0, 6)}...${account.slice(-4)}`;

  const handleDisconnect = () => {
    setAccountSync(null);
    setShowDropdown(false);
    setAccountState(null);
    navigate("/", { replace: true });
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        title="Connected wallet"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 36, height: 36, borderRadius: "50%",
          border: "2px solid #58a6ff", background: "#161b22",
          color: "#58a6ff", cursor: "pointer", fontSize: 15, fontWeight: 700,
          fontFamily: "monospace", padding: 0,
        }}
      >
        {account.replace(/^0x/i, "").charAt(1).toUpperCase()}
      </button>

      {showDropdown && (
        <div style={{
          position: "absolute", top: 44, right: 0, minWidth: 200,
          background: "#161b22", border: "1px solid #30363d",
          borderRadius: 12, overflow: "hidden", zIndex: 100,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          <div
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 16px", cursor: "pointer", background: "#1c2128",
            }}
            onClick={() => setShowDropdown(false)}
            onMouseEnter={(e) => e.currentTarget.style.background = "#1f6feb33"}
            onMouseLeave={(e) => e.currentTarget.style.background = "#1c2128"}
          >
            <span style={{ fontSize: 16 }}>👤</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#e1e4e8" }}>User Profile</div>
              <div style={{ fontSize: 11, color: "#8b949e", fontFamily: "monospace", marginTop: 2 }}>{shortAddr}</div>
            </div>
          </div>
          <div style={{ height: 1, background: "#30363d", margin: "0 12px" }} />
          <div
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 16px", cursor: "pointer",
            }}
            onClick={handleDisconnect}
            onMouseEnter={(e) => e.currentTarget.style.background = "#f8514933"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <span style={{ fontSize: 16 }}>🔌</span>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f85149", flex: 1 }}>Disconnect Wallet</div>
          </div>
        </div>
      )}
    </div>
  );
}
