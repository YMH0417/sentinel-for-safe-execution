import { useEffect, useState, useCallback } from "react";
import { getAddress } from "ethers";
import { useWallet } from "../contexts/WalletContext";
import { api, type OnChainAchievements } from "../api/client";
import { WalletBalanceCard } from "./WalletBalanceCard";
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
    title: "开张",
    icon: "①",
    image: badget1,
    description: "第一笔走 Safe 模式、Agent 放行的换币，开张勋章就到手。",
    requirement: "完成 1 笔 Safe 放行成交",
  },
  {
    id: "badge-2",
    tier: 1,
    title: "回头客",
    icon: "②",
    image: badget2,
    description: "不图快、走 Safe，让 Agent 帮你把关，成交量慢慢攒起来。",
    requirement: "USDC 成交满 $1 万，且 3 笔 Safe 放行成交",
  },
  {
    id: "badge-3",
    tier: 2,
    title: "老江湖",
    icon: "③",
    image: badget3,
    description: "交易量和 Safe 次数都上来了，说明你是正经用这个系统的人。",
    requirement: "USDC 成交满 $5 万，且 5 笔 Safe 放行成交",
  },
  {
    id: "badge-4",
    tier: 3,
    title: "大户",
    icon: "④",
    image: badget4,
    description: "十万刀级别的成交量，还一直走 Safe——这很少见。",
    requirement: "USDC 成交满 $10 万，且 10 笔 Safe 放行成交",
  },
  {
    id: "badge-5",
    tier: 4,
    title: "百万俱乐部",
    icon: "⑤",
    image: badget5,
    description: "Demo 里的天花板成就：百万美元成交量，还坚持 Safe 换币。",
    requirement: "USDC 成交满 $100 万，且 10 笔 Safe 放行成交",
  },
];

const TOP_VOLUME = 1_000_000;
const VOLUME_TIERS = [0, 10_000, 50_000, 100_000, TOP_VOLUME] as const;

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

  const checksumAddr = account ? (() => { try { return getAddress(account); } catch { return null; } })() : null;

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
    void refreshAchievements();
  }, [refreshAchievements]);

  const safeVolume = Number(achievements?.usdcVolumeHuman ?? 0);
  const unlockedBadges = BADGES.filter((b) => isBadgeUnlocked(achievements, b.tier));
  const lockedBadges = BADGES.filter((b) => !isBadgeUnlocked(achievements, b.tier));
  const nextVolumeTier = VOLUME_TIERS.find((t) => safeVolume < t) ?? TOP_VOLUME;
  const prevVolumeTier = VOLUME_TIERS.filter((t) => t <= safeVolume).pop() ?? 0;
  const volumeProgressPct =
    nextVolumeTier > prevVolumeTier
      ? Math.min(((safeVolume - prevVolumeTier) / (nextVolumeTier - prevVolumeTier)) * 100, 100)
      : 100;

  return (
    <div>
      {checksumAddr ? <WalletBalanceCard address={checksumAddr} /> : null}

      <div className="sentinel-grid-2" style={{ marginTop: 24, marginBottom: 24 }}>
        <div className="sentinel-card">
          <div className="sentinel-label">活动统计</div>
          {loading ? (
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>加载中</p>
          ) : achievementsError ? (
            <p style={{ color: "var(--red)", fontSize: 14, margin: 0 }}>{achievementsError}</p>
          ) : account && achievements ? (
            <>
              <StatRow label="经校验成交" value={String(achievements.checkCount)} />
              <StatRow label="成交笔数" value={String(achievements.tradeCount ?? achievements.safeSwapCount)} />
              <StatRow label="Safe 模式成交" value={String(achievements.safeSwapCount)} />
              <StatRow label="已解锁勋章" value={`${unlockedBadges.length}/${BADGES.length}`} accent="var(--green)" />
            </>
          ) : (
            <p style={{ color: "var(--text-muted)", fontSize: 14, margin: 0 }}>
              连接 MetaMask 后可读取链上成就数据
            </p>
          )}
        </div>
        <div className="sentinel-card">
          <div className="sentinel-label">累计 USDC 交易量</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: "var(--cyan)", fontFamily: "var(--font-display)", marginBottom: 8 }}>
            ${safeVolume.toLocaleString()}
          </div>
          <div style={{ height: 8, background: "#21262d", borderRadius: 4, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${volumeProgressPct}%`,
                background: "var(--gradient-brand)",
                borderRadius: 4,
                transition: "width 0.5s ease",
              }}
            />
          </div>
          <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>
            距下一档 ${nextVolumeTier.toLocaleString()} 还需 $
            {Math.max(nextVolumeTier - safeVolume, 0).toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}{" "}
            · 已解锁 {unlockedBadges.length}/{BADGES.length} 枚勋章
          </div>
        </div>
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
            <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>解锁条件</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{badge.requirement}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>状态</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: isUnlocked ? "var(--green)" : "var(--red)" }}>
              {isUnlocked ? "已解锁（链上）" : "未解锁"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
