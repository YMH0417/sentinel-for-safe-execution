import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../contexts/WalletContext";
import { useToast } from "./Toast";
import { getAddress } from "ethers";

export function HeaderAvatar() {
  const navigate = useNavigate();
  const { account, connectWallet, disconnectWallet, isConnecting } = useWallet();
  const { showToast } = useToast();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!account) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [account]);

  if (!account) {
    return (
      <button
        onClick={async () => {
          try {
            await connectWallet();
            showToast({ type: "success", message: "MetaMask 已连接" });
          } catch (e: unknown) {
            showToast({
              type: "error",
              message: e instanceof Error ? e.message : "连接失败",
            });
          }
        }}
        disabled={isConnecting}
        style={{
          padding: "8px 14px",
          borderRadius: 8,
          border: "1px solid #238636",
          background: "#23863622",
          color: "#3fb950",
          fontSize: 13,
          fontWeight: 600,
          cursor: isConnecting ? "not-allowed" : "pointer",
        }}
      >
        {isConnecting ? "连接中..." : "连接 MetaMask"}
      </button>
    );
  }

  const checksumAddr = getAddress(account);
  const shortAddr = `${checksumAddr.slice(0, 6)}...${checksumAddr.slice(-4)}`;

  const handleDisconnect = () => {
    setShowDropdown(false);
    disconnectWallet();
    navigate("/", { replace: true });
    showToast({ type: "info", message: "Wallet disconnected." });
  };

  const firstChar = checksumAddr.replace(/^0x/i, "").charAt(1).toUpperCase();

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      {/* Avatar button */}
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
          fontSize: 15,
          fontWeight: 700,
          fontFamily: "monospace",
          padding: 0,
        }}
      >
        {firstChar}
      </button>

      {/* Dropdown */}
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
            onClick={() => {
              setShowDropdown(false);
              navigate("/profile");
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = "#1f6feb33"}
            onMouseLeave={(e) => e.currentTarget.style.background = "#1c2128"}
          >
            <span style={{ fontSize: 16 }}>馃懁</span>
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
            <span style={{ fontSize: 16 }}>馃攳</span>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f85149", flex: 1 }}>Disconnect Wallet</div>
          </div>
        </div>
      )}
    </div>
  );
}
