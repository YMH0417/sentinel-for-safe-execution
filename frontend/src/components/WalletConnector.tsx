import { useState, useEffect, useCallback, useRef } from "react";
import { BrowserProvider, getAddress } from "ethers";
import { useToast } from "./Toast";

interface Props {
  onConnect?: (address: string) => void;
}

export function WalletConnector({ onConnect }: Props) {
  const { showToast } = useToast();
  const [account, setAccount] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      checkConnection();
    }
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const checkConnection = async () => {
    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.listAccounts();
      if (accounts.length > 0) {
        const addr = accounts[0].address;
        setAccount(addr);
        onConnect?.(addr);
      }
    } catch (e: any) {
      console.error("Check connection failed:", e);
    }
  };

  const handleDisconnect = useCallback(() => {
    setAccount(null);
    setShowDropdown(false);
    showToast({ type: "info", message: "Wallet disconnected." });
    onConnect?.("");
  }, [onConnect, showToast]);

  useEffect(() => {
    if (!window.ethereum) return;
    const eth = window.ethereum;
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        setAccount(null);
      } else {
        setAccount(accounts[0]);
        onConnect?.(accounts[0]);
      }
    };
    eth.on("accountsChanged", handleAccountsChanged);
    return () => {
      eth.removeListener("accountsChanged", handleAccountsChanged);
    };
  }, [onConnect]);

  const shortAddress = account
    ? `${getAddress(account).slice(0, 6)}...${getAddress(account).slice(-4)}`
    : "";

  // When NOT connected, don't render anything (LandingPage handles connection)
  if (!account) return null;

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      {/* Avatar */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        title={account || "Connected wallet"}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "2px solid #58a6ff",
          background: "#161b22",
          color: "#58a6ff",
          cursor: "pointer",
          fontSize: 16,
          fontWeight: 700,
          fontFamily: "monospace",
          padding: 0,
          transition: "all 0.2s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = "0 0 8px rgba(88,166,255,0.4)";
          e.currentTarget.style.borderColor = "#58a6ff";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = "none";
          e.currentTarget.style.borderColor = "#58a6ff";
        }}
      >
        {account.toUpperCase().replace("0X", "").charAt(1)}
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <div style={{
          position: "absolute",
          top: 44,
          right: 0,
          minWidth: 220,
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 12,
          overflow: "hidden",
          zIndex: 100,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 16px",
              cursor: "pointer",
              background: "#1c2128",
            }}
            onClick={() => {
              setShowDropdown(false);
              showToast({
                type: "info",
                message: `Profile page — ${getAddress(account)}`,
                duration: 0,
              });
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#1f6feb33"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#1c2128"; }}
          >
            <span style={{ fontSize: 20 }}>👤</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#e1e4e8" }}>User Profile</div>
              <div style={{ fontSize: 11, color: "#8b949e", fontFamily: "monospace", marginTop: 2 }}>{shortAddress}</div>
            </div>
            <span style={{ color: "#484f58", fontSize: 12 }}>&gt;</span>
          </div>
          <div style={{ height: 1, background: "#30363d", margin: "0 12px" }} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 16px",
              cursor: "pointer",
            }}
            onClick={handleDisconnect}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#f8514933"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ fontSize: 20 }}>🔌</span>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#f85149" }}>Disconnect Wallet</div>
          </div>
        </div>
      )}
    </div>
  );
}
