import { useCallback, useEffect, useState } from "react";
import { BrowserProvider, formatEther, getAddress } from "ethers";
import { api, type TokenBalance } from "../api/client";
import { fetchNativeCurrencySymbol } from "../lib/wallet";
import { Identicon } from "./WalletAvatar";

interface Props {
  address: string;
  compact?: boolean;
}

export function WalletBalanceCard({ address, compact = false }: Props) {
  const checksumAddr = (() => {
    try {
      return getAddress(address);
    } catch {
      return null;
    }
  })();

  const [nativeBal, setNativeBal] = useState<string | null>(null);
  const [nativeSymbol, setNativeSymbol] = useState("MON");
  const [tokens, setTokens] = useState<Record<string, TokenBalance>>({});

  const fetchBalances = useCallback(async () => {
    if (!checksumAddr) return;
    try {
      if (window.ethereum) {
        const provider = new BrowserProvider(window.ethereum);
        const bal = await provider.getBalance(checksumAddr);
        setNativeBal(formatEther(bal));
      }
    } catch {
      setNativeBal(null);
    }
    try {
      setNativeSymbol(await fetchNativeCurrencySymbol());
    } catch {
      setNativeSymbol("MON");
    }
    try {
      const r = await api.balances(checksumAddr);
      setTokens(r.balances);
    } catch {
      setTokens({});
    }
  }, [checksumAddr]);

  useEffect(() => {
    void fetchBalances();
  }, [fetchBalances]);

  if (!checksumAddr) return null;

  const avatarSize = compact ? 48 : 64;
  const padding = compact ? "16px 20px" : "20px 24px";

  return (
    <div
      className="sentinel-card wallet-balance-card"
      style={{ marginBottom: compact ? 16 : 24, display: "flex", alignItems: "center", gap: 20, padding }}
    >
      <div style={{ flexShrink: 0 }}>
        <div style={{ borderRadius: "50%", padding: 3, background: "var(--gradient-brand)" }}>
          <div style={{ borderRadius: "50%", background: "var(--bg-inset)", padding: 2 }}>
            <Identicon address={checksumAddr} size={avatarSize} />
          </div>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>钱包地址</div>
        <div
          style={{
            fontSize: compact ? 13 : 15,
            fontWeight: 600,
            fontFamily: "monospace",
            marginBottom: 12,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {checksumAddr}
        </div>
        <div style={{ display: "flex", gap: compact ? 16 : 24, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 2 }}>原生余额</div>
            <div
              style={{
                fontSize: compact ? 16 : 18,
                fontWeight: 700,
                color: "var(--cyan)",
                fontFamily: "var(--font-display)",
              }}
            >
              {nativeBal !== null ? `${parseFloat(nativeBal).toFixed(4)} ${nativeSymbol}` : "加载中"}
            </div>
          </div>
          {Object.values(tokens).map((t) => (
            <div key={t.symbol}>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 2 }}>{t.symbol}</div>
              <div
                style={{
                  fontSize: compact ? 16 : 18,
                  fontWeight: 700,
                  color: "var(--cyan)",
                  fontFamily: "var(--font-display)",
                }}
              >
                {t.human.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
