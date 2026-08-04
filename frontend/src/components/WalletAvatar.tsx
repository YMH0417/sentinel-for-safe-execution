import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getAddress, BrowserProvider, formatEther } from "ethers";
import { useWallet } from "../contexts/WalletContext";
import { useToast } from "./Toast";
import { api, type TokenBalance } from "../api/client";

/* ────────────────────── Identicon (GitHub-style) ────────────────────── */

interface IdenticonData {
  color: string;
  grid: boolean[];
}

/**
 * Deterministically generate a GitHub-style identicon from an Ethereum address.
 * - Derives an HSL color from the first 3 bytes.
 * - Builds a 5×5 grid that is mirrored horizontally (columns 0-2 → 4-2).
 */
function generateIdenticon(address: string): IdenticonData {
  const hex = address.replace(/^0x/i, "").toLowerCase();
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  if (bytes.length === 0) return { color: "#58a6ff", grid: new Array(25).fill(false) };

  // Color
  const hue = bytes[0] % 360;
  const sat = 60 + (bytes[1] % 25);
  const light = 45 + (bytes[2] % 15);
  const color = `hsl(${hue}, ${sat}%, ${light}%)`;

  // 5×5 grid, mirror horizontally
  const grid = new Array(25).fill(false);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const idx = (row * 3 + col + 3) % bytes.length;
      const filled = bytes[idx] % 2 === 1;
      grid[row * 5 + col] = filled;
      grid[row * 5 + (4 - col)] = filled;
    }
  }

  return { color, grid };
}

export function Identicon({ address, size = 34 }: { address: string; size?: number }) {
  const { color, grid } = generateIdenticon(address);
  const cell = size / 5;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: "block", borderRadius: "50%" }}
    >
      <rect width={size} height={size} fill="var(--bg-inset)" rx={size / 2} />
      {grid.map((on, i) => {
        if (!on) return null;
        const r = Math.floor(i / 5);
        const c = i % 5;
        return (
          <rect
            key={i}
            x={c * cell}
            y={r * cell}
            width={cell}
            height={cell}
            fill={color}
          />
        );
      })}
    </svg>
  );
}

/* ────────────────────── WalletAvatar ────────────────────── */

export function WalletAvatar() {
  const navigate = useNavigate();
  const { account, disconnectWallet, isConnecting, connectWallet } = useWallet();
  const { showToast } = useToast();

  const [open, setOpen] = useState(false);
  const [nativeBal, setNativeBal] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Record<string, TokenBalance>>({});
  const [copied, setCopied] = useState(false);

  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const checksumAddr = account ? (() => { try { return getAddress(account); } catch { return null; } })() : null;
  const shortAddr = checksumAddr
    ? `${checksumAddr.slice(0, 6)}...${checksumAddr.slice(-4)}`
    : "";

  /* Fetch balances when the popup opens */
  const fetchBalances = useCallback(async () => {
    if (!checksumAddr) return;

    // Native ETH balance via MetaMask provider
    try {
      if (window.ethereum) {
        const provider = new BrowserProvider(window.ethereum);
        const bal = await provider.getBalance(checksumAddr);
        setNativeBal(formatEther(bal));
      }
    } catch {
      setNativeBal(null);
    }

    // Token balances via backend API
    try {
      const r = await api.balances(checksumAddr);
      setTokens(r.balances);
    } catch {
      setTokens({});
    }
  }, [checksumAddr]);

  useEffect(() => {
    if (open && checksumAddr) {
      fetchBalances();
    }
  }, [open, checksumAddr, fetchBalances]);

  /* Click-outside fallback (for touch / edge cases) */
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleMouseEnter = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  };

  const handleMouseLeave = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 200);
  };

  useEffect(() => {
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  }, []);

  const handleCopyAddress = () => {
    if (!checksumAddr) return;
    navigator.clipboard.writeText(checksumAddr).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleDisconnect = () => {
    setOpen(false);
    disconnectWallet();
    navigate("/", { replace: true });
    showToast({ type: "info", message: "Wallet disconnected" });
  };

  const handleProfile = () => {
    setOpen(false);
    navigate("/profile");
  };

  const handleConnect = async () => {
    try {
      await connectWallet();
      showToast({ type: "success", message: "MetaMask 已连接" });
    } catch (e) {
      showToast({
        type: "error",
        message: e instanceof Error ? e.message : "连接失败",
      });
    }
  };

  /* ── Not connected: show Connect Wallet button ── */
  if (!account || !checksumAddr) {
    return (
      <button
        type="button"
        className="sentinel-btn sentinel-btn-primary"
        onClick={handleConnect}
        disabled={isConnecting}
        style={{ padding: "10px 18px", fontSize: 14 }}
      >
        {isConnecting ? "连接中..." : "Connect Wallet"}
      </button>
    );
  }

  /* ── Connected: show avatar + hover popup ── */
  return (
    <div
      ref={wrapperRef}
      className="wallet-avatar-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Avatar pill */}
      <button
        type="button"
        className="wallet-avatar-btn"
        title={checksumAddr}
        onClick={() => setOpen(o => !o)}
      >
        <span className="wallet-avatar-ring">
          <Identicon address={checksumAddr} size={32} />
        </span>
        <span className="wallet-avatar-addr">{shortAddr}</span>
      </button>

      {/* Hover popup */}
      {open && (
        <div className="wallet-avatar-popup" role="menu">
         
          {/* Balance */}
          <div className="wallet-popup-balance">
            <div className="wallet-popup-balance-value">
              {nativeBal !== null
                ? `${parseFloat(nativeBal).toFixed(4)} ETH`
                : "Loading..."}
            </div>
            {Object.values(tokens).length > 0 && (
              <div className="wallet-popup-token-list">
                {Object.values(tokens).map((t) => (
                  <span key={t.symbol} className="wallet-popup-token">
                    {t.human.toLocaleString(undefined, { maximumFractionDigits: 2 })} {t.symbol}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="wallet-popup-divider" />

          {/* Address row with copy */}
          <div className="wallet-popup-addr-row">
            <span className="wallet-avatar-ring wallet-avatar-ring-sm">
              <Identicon address={checksumAddr} size={20} />
            </span>
            <span className="wallet-popup-addr-text">{shortAddr}</span>
            <button
              type="button"
              className="wallet-popup-icon-btn"
              onClick={handleCopyAddress}
              title="Copy address"
            >
              {copied ? "✓" : "⧉"}
            </button>
          </div>

          <div className="wallet-popup-divider" />

          {/* View Profile */}
          <button
            type="button"
            className="wallet-popup-action wallet-popup-action-profile"
            onClick={handleProfile}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.3" />
              <path
                d="M2 12.5c0-2.5 2.2-4 5-4s5 1.5 5 4"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
            View Profile
          </button>

          {/* Disconnect */}
          <button
            type="button"
            className="wallet-popup-action wallet-popup-action-disconnect"
            onClick={handleDisconnect}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M5 1H3a2 2 0 00-2 2v8a2 2 0 002 2h2M9 4l3 3-3 3M6 7h6"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Disconnect Wallet
          </button>
        </div>
      )}
    </div>
  );
}
