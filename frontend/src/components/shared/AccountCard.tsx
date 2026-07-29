import { getAddress } from "ethers";
import { useEffect, useState } from "react";
import { api, type TokenBalance } from "../../api/client";
import { useWallet } from "../../contexts/WalletContext";

export function AccountCard() {
  const { account } = useWallet();
  const [balances, setBalances] = useState<Record<string, TokenBalance>>({});

  useEffect(() => {
    if (!account) {
      setBalances({});
      return;
    }
    api.balances(getAddress(account))
      .then((r) => setBalances(r.balances))
      .catch(() => setBalances({}));
  }, [account]);

  if (!account) {
    return (
      <div className="sentinel-card" style={{ marginBottom: 20 }}>
        <div className="sentinel-label">账户</div>
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>连接 MetaMask 查看余额与执行 swap</p>
      </div>
    );
  }

  const addr = getAddress(account);
  const usdc = balances.USDC?.human ?? 0;
  const good = balances.GOOD?.human ?? 0;

  return (
    <div
      className="sentinel-card sentinel-card-glow"
      style={{
        marginBottom: 20,
        background: "linear-gradient(135deg, #121820 0%, #1a1030 100%)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 16,
      }}
    >
      <div>
        <div className="sentinel-label">SENTINEL PREMIUM</div>
        <div style={{ fontFamily: "monospace", fontSize: 15, color: "var(--cyan)", marginBottom: 8 }}>
          {addr.slice(0, 8)}...{addr.slice(-6)}
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--text-muted)" }}>
          <span>USDC: <strong style={{ color: "var(--text)" }}>{usdc.toLocaleString()}</strong></span>
          <span>GOOD: <strong style={{ color: "var(--text)" }}>{good.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></span>
        </div>
      </div>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: "var(--gradient-btn)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          color: "#0a0e17",
          fontSize: 20,
        }}
      >
        {addr.replace(/^0x/i, "").charAt(1).toUpperCase()}
      </div>
    </div>
  );
}
