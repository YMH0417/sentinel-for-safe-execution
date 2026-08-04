import { useEffect, useState, useCallback } from "react";
import { BrowserProvider, formatEther, getAddress } from "ethers";
import { useWallet } from "../contexts/WalletContext";
import { api, type OnChainAchievements, type TokenBalance } from "../api/client";
import { fetchNativeCurrencySymbol } from "../lib/wallet";
import { Identicon } from "./WalletAvatar";
import badget1 from "../imgs/badget1.svg";
import badget2 from "../imgs/badget2.svg";
import badget3 from "../imgs/badget3.svg";
import badget4 from "../imgs/badget4.svg";
import badget5 from "../imgs/badget5.svg";

interface BadgeData {
  id: string;
  tier: number;
  title: string;
  icon: string;
  image: string;
  description: string;
  requirement: string;
}

const BADGES: BadgeData[] = [
  {
    id: "badge-1",
    tier: 0,
    title: "First Check Swap",
    icon: "①",
    image: badget1,
    description: "Complete your first Safe Mode swap that passes the on-chain Sentinel check.",
    requirement: "1+ trade",
  },
  {
    id: "badge-2",
    tier: 1,
    title: "Diligent Guardian",
    icon: "②",
    image: badget2,
    description: "Demonstrate consistent Safe Mode usage with meaningful USDC volume.",
    requirement: "Volume ≥ $10,000, 3+ checked trades",
  },
  {
    id: "badge-3",
    tier: 2,
    title: "Sentinel Adept",
    icon: "③",
    image: badget3,
    description: "Sustain higher protected trading volume with repeated Sentinel checks.",
    requirement: "Volume ≥ $50,000, 5+ checks",
  },
  {
    id: "badge-4",
    tier: 3,
    title: "Vault Sovereign",
    icon: "④",
    image: badget4,
    description: "Reach advanced cumulative USDC volume with disciplined check habits.",
    requirement: "Volume ≥ $100,000, 10+ checks",
  },
  {
    id: "badge-5",
    tier: 4,
    title: "Legend of Sentinel",
    icon: "⑤",
    image: badget5,
    description: "The ultimate on-chain achievement — million-dollar protected volume.",
    requirement: "Volume ≥ $1,000,000, 10+ checks",
  },
];

const TOP_VOLUME = 1_000_000;

function isBadgeUnlocked(achievements: OnChainAchievements | null, tier: number): boolean {
  if (!achievements) return false;
  return achievements.badges.some((b) => b.tier === tier && b.unlocked);
}

export function UserProfilePage() {
  const { account } = useWallet();
  const [selectedBadge, setSelectedBadge] = useState<BadgeData | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [achievements, setAchievements] = useState<OnChainAchievements | null>(null);
  const [achievementsError, setAchievementsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [nativeBal, setNativeBal] = useState<string | null>(null);
  const [nativeSymbol, setNativeSymbol] = useState("MON");
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

  const refreshAchievements = useCallback(async () => {
    if (!checksumAddr) {
      setAchievements(null);
      setAchievementsError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setAchievementsError("");
    try {
      const view = await api.demoAchievements(checksumAddr);
      setAchievements(view);
    } catch (e) {
      setAchievements(null);
      setAchievementsError(e instanceof Error ? e.message : "无法读取链上勋章数据");
    } finally {
      setLoading(false);
    }
  }, [checksumAddr]);

  useEffect(() => {
    if (checksumAddr) fetchBalances();
  }, [checksumAddr, fetchBalances]);

  useEffect(() => {
    void refreshAchievements();
  }, [refreshAchievements]);

  const safeVolume = achievements?.usdcVolumeHuman ?? 0;
  const unlockedBadges = BADGES.filter((b) => isBadgeUnlocked(achievements, b.tier));
  const lockedBadges = BADGES.filter((b) => !isBadgeUnlocked(achievements, b.tier));
  const nextVolumeTier = [10_000, 50_000, 100_000, 1_000_000].find((t) => safeVolume < t) ?? TOP_VOLUME;

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 className="sentinel-title" style={{ margin: "0 0 8px" }}>账户与勋章</h2>
        <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)" }}>
          本地交易账本：经 Check 成交次数、USDC 交易量与勋章（每笔成交写入，无需扫块）
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
                  {nativeBal !== null ? `${parseFloat(nativeBal).toFixed(4)} ${nativeSymbol}` : "加载中"}
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

      <div className="sentinel-label" style={{ marginTop: 24, marginBottom: 12 }}>链上交易概览</div>
      <div className="sentinel-grid-2" style={{ marginBottom: 24 }}>
        <div className="sentinel-card">
          <div className="sentinel-label">活动统计（链上）</div>
          {loading ? (
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>加载中</p>
          ) : achievementsError ? (
            <p style={{ color: "var(--red)", fontSize: 14, margin: 0 }}>{achievementsError}</p>
          ) : account && achievements ? (
            <>
              <StatRow label="经 Check 成交" value={String(achievements.checkCount)} />
              <StatRow label="成交笔数" value={String(achievements.tradeCount ?? achievements.safeSwapCount)} />
              <StatRow label="Safe Swap" value={String(achievements.safeSwapCount)} />
              <StatRow label="已解锁勋章" value={`${unlockedBadges.length}/${BADGES.length}`} accent="var(--green)" />
            </>
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>
              连接 MetaMask 后可读取链上成就数据
            </p>
          )}
        </div>
        <div className="sentinel-card">
          <div className="sentinel-label">累计 USDC 交易量（链上）</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "var(--cyan)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
            ${safeVolume.toLocaleString()}
          </div>
          <div style={{ height: 8, background: "#21262d", borderRadius: 4, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${Math.min((safeVolume / TOP_VOLUME) * 100, 100)}%`,
                background: "var(--gradient-brand)",
                borderRadius: 4,
                transition: "width 0.5s ease",
              }}
            />
          </div>
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>
            下一档交易量: ${nextVolumeTier.toLocaleString()} · 已解锁 {unlockedBadges.length}/{BADGES.length} 枚勋章
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div className="sentinel-label" style={{ margin: 0 }}>勋章墙</div>
        {checksumAddr && (
          <button type="button" className="sentinel-btn sentinel-btn-secondary" onClick={() => refreshAchievements()} disabled={loading}>
            {loading ? "刷新中" : "刷新链上数据"}
          </button>
        )}
      </div>
      <div className="badget-wall">
        {[...unlockedBadges, ...lockedBadges].map((badge) => {
          const isUnlocked = isBadgeUnlocked(achievements, badge.tier);
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
        <BadgeModal badge={selectedBadge} onClose={() => setShowModal(false)} achievements={achievements} />
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

function BadgeModal({
  badge,
  onClose,
  achievements,
}: {
  badge: BadgeData;
  onClose: () => void;
  achievements: OnChainAchievements | null;
}) {
  const isUnlocked = isBadgeUnlocked(achievements, badge.tier);

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
              {isUnlocked ? "✓ Unlocked (on-chain)" : "🔒 Locked"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
