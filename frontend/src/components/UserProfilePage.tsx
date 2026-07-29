import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../contexts/WalletContext";
import { getAddress } from "ethers";
import { api, computeUserStats } from "../api/client";
import { AccountCard } from "./shared/AccountCard";

interface BadgeData {
  id: string;
  title: string;
  icon: string;
  description: string;
  requirement: string;
  threshold: number;
}

const BADGES: BadgeData[] = [
  {
    id: "badge-1",
    title: "First Step",
    icon: "①",
    description: "Cumulative safe trading volume reaches $1,000",
    requirement: "Volume ≥ $1,000",
    threshold: 1000,
  },
  {
    id: "badge-2",
    title: "Diligent Guardian",
    icon: "②",
    description: "Cumulative safe trading volume reaches $10,000 with 5+ Safe Mode checks",
    requirement: "Volume ≥ $10,000, 5+ checks",
    threshold: 10000,
  },
  {
    id: "badge-3",
    title: "Sentinel Adept",
    icon: "③",
    description: "Cumulative safe trading volume reaches $50,000 with zero failures",
    requirement: "Volume ≥ $50,000, 0 failures",
    threshold: 50000,
  },
  {
    id: "badge-4",
    title: "Vault Sovereign",
    icon: "④",
    description: "Cumulative safe trading volume reaches $200,000 — elite tier achievement",
    requirement: "Volume ≥ $200,000",
    threshold: 200000,
  },
  {
    id: "badge-5",
    title: "Legend of Sentinel",
    icon: "⑤",
    description: "The ultimate achievement — cumulative safe trading volume exceeds $1,000,000",
    requirement: "Volume ≥ $1,000,000",
    threshold: 1000000,
  },
];

const TOP_THRESHOLD = 1000000;

export function UserProfilePage() {
  const navigate = useNavigate();
  const { account } = useWallet();
  const [selectedBadge, setSelectedBadge] = useState<BadgeData | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [safeVolume, setSafeVolume] = useState(0);
  const [stats, setStats] = useState({ swapCount: 0, rejectCount: 0, fallbackCount: 0, safeVolumeUsd: 0 });
  const [loading, setLoading] = useState(true);

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

  const checksumAddr = account ? getAddress(account) : "0x0000000000000000000000000000000000000000";
  const unlockedBadges = BADGES.filter((b) => safeVolume >= b.threshold);
  const lockedBadges = BADGES.filter((b) => safeVolume < b.threshold);
  const nextTier = BADGES.find((b) => safeVolume < b.threshold)?.threshold ?? TOP_THRESHOLD;

  return (
    <div>
      <AccountCard />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="sentinel-btn sentinel-btn-ghost"
          style={{ padding: "4px 8px", fontSize: 13 }}
        >
          ← 返回
        </button>
        <h2 className="sentinel-title" style={{ margin: 0 }}>账户 · 勋章墙</h2>
      </div>

      <div className="sentinel-grid-2" style={{ marginBottom: 24 }}>
        <div className="sentinel-card">
          <div className="sentinel-label">Connected Wallet</div>
          <div style={{ fontFamily: "monospace", fontSize: 14, color: "var(--cyan)", wordBreak: "break-all" }}>
            {checksumAddr}
          </div>
        </div>
        <div className="sentinel-card">
          <div className="sentinel-label">交易统计</div>
          {loading ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>加载中...</p>
          ) : (
            <>
              <StatRow label="成功 Swap" value={String(stats.swapCount)} />
              <StatRow label="拒绝 / 失败" value={String(stats.rejectCount)} accent={stats.rejectCount > 0 ? "var(--red)" : undefined} />
              <StatRow label="Fallback 次数" value={String(stats.fallbackCount)} />
            </>
          )}
        </div>
      </div>

      <div className="sentinel-card" style={{ marginBottom: 24 }}>
        <div className="sentinel-label">Cumulative Safe Trading Volume</div>
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
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          下一等级: ${nextTier.toLocaleString()}
        </div>
      </div>

      <div className="sentinel-label">NFT Achievement Badges</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 32 }}>
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
              className="sentinel-card"
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
                  background: isUnlocked
                    ? "radial-gradient(circle, rgba(0,255,255,0.15), rgba(0,255,136,0.08))"
                    : "#21262d",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                  color: isUnlocked ? "var(--cyan)" : "var(--text-dim)",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  border: isUnlocked ? "2px solid rgba(0,255,255,0.25)" : "2px solid var(--border)",
                }}
              >
                {isUnlocked ? badge.icon : "🔒"}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: isUnlocked ? "var(--text)" : "var(--text-dim)", marginBottom: 4 }}>
                {badge.title}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{badge.requirement}</div>
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
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderBottom: "1px solid #1a2332" }}>
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
            background: isUnlocked
              ? "radial-gradient(circle, rgba(0,255,255,0.2), rgba(0,255,136,0.08))"
              : "repeating-linear-gradient(45deg, #21262d, #21262d 10px, #1c2128 10px, #1c2128 20px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 44,
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            color: isUnlocked ? "var(--cyan)" : "var(--text-dim)",
            border: isUnlocked ? "3px solid var(--cyan)" : "3px dashed var(--border)",
          }}
        >
          {isUnlocked ? badge.icon : "🔒"}
        </div>

        <h3 style={{ fontSize: 20, fontWeight: 700, textAlign: "center", marginBottom: 8 }}>{badge.title}</h3>
        <p style={{ fontSize: 14, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.6, marginBottom: 16 }}>
          {badge.description}
        </p>

        <div style={{ display: "flex", justifyContent: "space-around", borderTop: "1px solid var(--border)", paddingTop: 16 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Requirement</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{badge.requirement}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Status</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: isUnlocked ? "var(--green)" : "var(--red)" }}>
              {isUnlocked ? "✓ Unlocked" : "🔒 Locked"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
