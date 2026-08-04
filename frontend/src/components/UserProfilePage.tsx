import { useEffect, useState, useCallback } from "react";
import { BrowserProvider, formatEther, getAddress } from "ethers";
import { useWallet } from "../contexts/WalletContext";
import { api, computeUserStats, type TokenBalance } from "../api/client";
import { Identicon } from "./WalletAvatar";
import badget1 from "../imgs/badget1.svg";
import badget2 from "../imgs/badget2.svg";
import badget3 from "../imgs/badget3.svg";
import badget4 from "../imgs/badget4.svg";
import badget5 from "../imgs/badget5.svg";

interface BadgeData {
  id: string;
  title: string;
  icon: string;
  image: string;
  description: string;
  requirement: string;
  threshold: number;
}

const BADGES: BadgeData[] = [
  {
    id: "badge-1",
    title: "First Step",
    icon: "①",
    image: badget1,
    description: "Cumulative safe trading volume reaches $1,000",
    requirement: "Volume ≥ $1,000",
    threshold: 1000,
  },
  {
    id: "badge-2",
    title: "Diligent Guardian",
    icon: "②",
    image: badget2,
    description: "Cumulative safe trading volume reaches $10,000 with 5+ Safe Mode checks",
    requirement: "Volume ≥ $10,000, 5+ checks",
    threshold: 10000,
  },
  {
    id: "badge-3",
    title: "Sentinel Adept",
    icon: "③",
    image: badget3,
    description: "Cumulative safe trading volume reaches $50,000 with zero failures",
    requirement: "Volume ≥ $50,000, 0 failures",
    threshold: 50000,
  },
  {
    id: "badge-4",
    title: "Vault Sovereign",
    icon: "④",
    image: badget4,
    description: "Cumulative safe trading volume reaches $200,000 — elite tier achievement",
    requirement: "Volume ≥ $200,000",
    threshold: 200000,
  },
  {
    id: "badge-5",
    title: "Legend of Sentinel",
    icon: "⑤",
    image: badget5,
    description: "The ultimate achievement — cumulative safe trading volume exceeds $1,000,000",
    requirement: "Volume ≥ $1,000,000",
    threshold: 1000000,
  },
];

const TOP_THRESHOLD = 1000000;

export function UserProfilePage() {
  const { account } = useWallet();
  const [selectedBadge, setSelectedBadge] = useState<BadgeData | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [safeVolume, setSafeVolume] = useState(0);
  const [stats, setStats] = useState({ swapCount: 0, rejectCount: 0, fallbackCount: 0, safeVolumeUsd: 0 });
  const [loading, setLoading] = useState(true);
  const [nativeBal, setNativeBal] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Record<string, TokenBalance>>({});

  const checksumAddr = account ? (() => { try { return getAddress(account); } catch { return null; } })() : null;

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
      const r = await api.balances(checksumAddr);
      setTokens(r.balances);
    } catch {
      setTokens({});
    }
  }, [checksumAddr]);

  useEffect(() => {
    if (checksumAddr) fetchBalances();
  }, [checksumAddr, fetchBalances]);

  useEffect(() => {
    api.events()
      .then((events) => {
        const s = computeUserStats(events);
        setStats(s);
        setSafeVolume(s.safeVolumeUsd);
      })
      .catch(() => {
        setStats({ swapCount: 0, rejectCount: 0, fallbackCount: 0, safeVolumeUsd: 0 });
        setSafeVolume(0);
      })
      .finally(() => setLoading(false));
  }, []);

  const unlockedBadges = BADGES.filter((b) => safeVolume >= b.threshold);
  const lockedBadges = BADGES.filter((b) => safeVolume < b.threshold);
  const nextTier = BADGES.find((b) => safeVolume < b.threshold)?.threshold ?? TOP_THRESHOLD;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 className="sentinel-title" style={{ margin: "0 0 8px" }}>账户与勋章</h2>
        <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>
          查看钱包概览、交易统计，以及基于安全交易量的成就勋章
        </p>
      </div>


      {checksumAddr && (
        <div className="sentinel-card" style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 20, padding: "20px 24px" }}>
          <div style={{ flexShrink: 0 }}>
            <div style={{ borderRadius: "50%", padding: 3, background: "var(--gradient-brand)" }}>
              <div style={{ borderRadius: "50%", background: "var(--bg-inset)", padding: 2 }}>
                <Identicon address={checksumAddr} size={64} />
              </div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>钱包地址</div>
            <div style={{
              fontSize: 15,
              fontWeight: 600,
              fontFamily: "monospace",
              marginBottom: 12,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {checksumAddr}
            </div>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 2 }}>原生余额</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--cyan)", fontFamily: "var(--font-display)" }}>
                  {nativeBal !== null ? `${parseFloat(nativeBal).toFixed(4)} ETH` : "加载中..."}
                </div>
              </div>
              {Object.values(tokens).map((t) => (
                <div key={t.symbol}>
                  <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 2 }}>{t.symbol}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--cyan)", fontFamily: "var(--font-display)" }}>
                    {t.human.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="sentinel-label" style={{ marginTop: 24, marginBottom: 12 }}>交易概览</div>
      <div className="sentinel-grid-2" style={{ marginBottom: 24 }}>
        <div className="sentinel-card">
          <div className="sentinel-label">活动统计</div>
          {loading ? (
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>加载中...</p>
          ) : account ? (
            <>
              <StatRow label="成功 Swap" value={String(stats.swapCount)} />
              <StatRow label="拒绝 / 失败" value={String(stats.rejectCount)} accent={stats.rejectCount > 0 ? "var(--red)" : undefined} />
              <StatRow label="Fallback 次数" value={String(stats.fallbackCount)} />
            </>
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>
              连接 MetaMask 后可在此查看与您钱包相关的链上活动
            </p>
          )}
        </div>
        <div className="sentinel-card">
          <div className="sentinel-label">累计安全交易量</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "var(--cyan)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
            ${safeVolume.toLocaleString()}
          </div>
          <div style={{ height: 8, background: "#21262d", borderRadius: 4, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${Math.min((safeVolume / TOP_THRESHOLD) * 100, 100)}%`,
                background: "var(--gradient-brand)",
                borderRadius: 4,
                transition: "width 0.5s ease",
              }}
            />
          </div>
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>
            下一等级: ${nextTier.toLocaleString()} · 已解锁 {unlockedBadges.length}/{BADGES.length} 枚勋章
          </div>
        </div>
      </div>

      <div className="sentinel-label" style={{ marginBottom: 12 }}>勋章墙</div>
      <div className="badget-wall">
        {[...unlockedBadges, ...lockedBadges].map((badge) => {
          const isUnlocked = safeVolume >= badge.threshold;
          return (
            <div
              key={badge.id}
              onClick={() => {
                if (isUnlocked) {
                  setSelectedBadge(badge);
                  setShowModal(true);
                }
              }}
              className="sentinel-card badget-item"
              style={{
                textAlign: "center",
                opacity: isUnlocked ? 1 : 0.45,
                cursor: isUnlocked ? "pointer" : "not-allowed",
                borderColor: isUnlocked ? "rgba(0,255,136,0.35)" : undefined,
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  margin: "0 auto 12px",
                  borderRadius: "50%",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: isUnlocked ? "2px solid rgba(0,229,204,0.25)" : "2px solid var(--border)",
                  background: isUnlocked
                    ? "radial-gradient(circle, rgba(0,229,204,0.15), rgba(0,255,136,0.08))"
                    : "#21262d",
                }}
              >
                <img
                  src={badge.image}
                  alt={badge.title}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: "50%",
                    filter: isUnlocked ? "none" : "grayscale(1) brightness(0.5)",
                  }}
                />
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: isUnlocked ? "var(--text)" : "var(--text-dim)", marginBottom: 4 }}>
                {badge.title}
              </div>
              <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{badge.requirement}</div>
            </div>
          );
        })}
      </div>

      {showModal && selectedBadge && (
        <BadgeModal badge={selectedBadge} onClose={() => setShowModal(false)} safeVolume={safeVolume} />
      )}
    </div>
  );
}

function StatRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 14, borderBottom: "1px solid #1a2332" }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontWeight: 600, color: accent ?? "var(--text)" }}>{value}</span>
    </div>
  );
}

function BadgeModal({ badge, onClose, safeVolume }: { badge: BadgeData; onClose: () => void; safeVolume: number }) {
  const isUnlocked = safeVolume >= badge.threshold;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="sentinel-card"
        style={{
          maxWidth: 420,
          width: "90%",
          borderColor: isUnlocked ? "rgba(0,255,136,0.35)" : undefined,
          position: "relative",
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 12,
            right: 16,
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            fontSize: 20,
            cursor: "pointer",
          }}
        >
          ✕
        </button>

        <div
          style={{
            width: 100,
            height: 100,
            margin: "0 auto 20px",
            borderRadius: "50%",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: isUnlocked
              ? "radial-gradient(circle, rgba(0,229,204,0.2), rgba(0,255,136,0.08))"
              : "repeating-linear-gradient(45deg, #21262d, #21262d 10px, #1c2128 10px, #1c2128 20px)",
            border: isUnlocked ? "3px solid var(--cyan)" : "3px dashed var(--border)",
          }}
        >
          <img
            src={badge.image}
            alt={badge.title}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: isUnlocked ? "none" : "grayscale(1) brightness(0.5)",
            }}
          />
        </div>

        <h3 style={{ fontSize: 20, fontWeight: 700, textAlign: "center", marginBottom: 8 }}>{badge.title}</h3>
        <p style={{ fontSize: 14, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.6, marginBottom: 16 }}>
          {badge.description}
        </p>

        <div style={{ display: "flex", justifyContent: "space-around", borderTop: "1px solid var(--border)", paddingTop: 16 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>Requirement</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{badge.requirement}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>Status</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: isUnlocked ? "var(--green)" : "var(--red)" }}>
              {isUnlocked ? "✓ Unlocked" : "🔒 Locked"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
