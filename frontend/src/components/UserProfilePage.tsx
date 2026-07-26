import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../contexts/WalletContext";
import { getAddress } from "ethers";

interface BadgeData {
  id: string;
  title: string;
  icon: string;
  description: string;
  requirement: string;
  threshold: number; // cumulative safe volume in USD
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

// Mock data: user has completed $3,500 safe volume so far
const MOCK_SAFE_VOLUME = 3500;

/**
 * UserProfilePage
 * Shows wallet info, cumulative safe volume progress, and NFT badges.
 * Clicking a badge opens a detail modal overlay.
 */
export function UserProfilePage() {
  const navigate = useNavigate();
  const { account } = useWallet();
  const [selectedBadge, setSelectedBadge] = useState<BadgeData | null>(null);
  const [showModal, setShowModal] = useState(false);

  const checksumAddr = account ? getAddress(account) : "0x0000000000000000000000000000000000000000";
  const shortAddr = `${checksumAddr.slice(0, 8)}...${checksumAddr.slice(-6)}`;

  const unlockedBadges = BADGES.filter((b) => MOCK_SAFE_VOLUME >= b.threshold);
  const lockedBadges = BADGES.filter((b) => MOCK_SAFE_VOLUME < b.threshold);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: "none", border: "none", color: "#58a6ff", cursor: "pointer",
            fontSize: 14, fontWeight: 600, padding: "4px 8px",
          }}
        >
          ← Back
        </button>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#e1e4e8", margin: 0 }}>User Profile</h2>
      </div>

      {/* Wallet card */}
      <div style={{
        background: "#161b22", borderRadius: 12, padding: 24,
        border: "1px solid #30363d", marginBottom: 24,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ fontSize: 13, color: "#8b949e", marginBottom: 4 }}>Connected Wallet</div>
            <div style={{ fontFamily: "monospace", fontSize: 14, color: "#58a6ff", wordBreak: "break-all" }}>
              {checksumAddr}
            </div>
          </div>
          <div style={{
            background: "#238636", color: "white", fontSize: 24, fontWeight: 700,
            width: 64, height: 64, borderRadius: "50%", display: "flex",
            alignItems: "center", justifyContent: "center", fontFamily: "monospace",
          }}>
            {checksumAddr.replace(/^0x/i, "").charAt(1).toUpperCase()}
          </div>
        </div>
      </div>

      {/* Volume progress */}
      <div style={{
        background: "#161b22", borderRadius: 12, padding: 24,
        border: "1px solid #30363d", marginBottom: 24,
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#8b949e", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
          Cumulative Safe Trading Volume
        </h3>
        <div style={{ fontSize: 32, fontWeight: 700, color: "#58a6ff", fontFamily: "monospace", marginBottom: 8 }}>
          ${MOCK_SAFE_VOLUME.toLocaleString()}
        </div>
        <div style={{
          height: 8, background: "#21262d", borderRadius: 4, overflow: "hidden",
        }}>
          <div style={{
            height: "100%", width: `${Math.min((MOCK_SAFE_VOLUME / MOCK_TOP_THRESHOLD) * 100, 100)}%`,
            background: "linear-gradient(90deg, #00ffff, #00ff88)", borderRadius: 4,
            transition: "width 0.5s ease",
          }} />
        </div>
        <div style={{ fontSize: 12, color: "#8b949e", marginTop: 4 }}>
          Next tier at ${(BADGES.find(b => MOCK_SAFE_VOLUME < b.threshold)?.threshold ?? 1000).toLocaleString()}
        </div>
      </div>

      {/* Badges grid */}
      <h3 style={{ fontSize: 14, fontWeight: 600, color: "#8b949e", marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 }}>
        NFT Achievement Badges
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 32 }}>
        {[...unlockedBadges, ...lockedBadges].map((badge) => {
          const isUnlocked = MOCK_SAFE_VOLUME >= badge.threshold;
          return (
            <div
              key={badge.id}
              onClick={() => {
                if (isUnlocked) {
                  setSelectedBadge(badge);
                  setShowModal(true);
                }
              }}
              style={{
                background: isUnlocked ? "#161b22" : "#0d1117",
                borderRadius: 12, padding: 20, textAlign: "center",
                border: isUnlocked ? "1px solid #238636" : "1px solid #30363d",
                opacity: isUnlocked ? 1 : 0.4,
                cursor: isUnlocked ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                position: "relative",
              }}
              onMouseEnter={(e) => {
                if (isUnlocked) e.currentTarget.style.borderColor = "#58a6ff";
              }}
              onMouseLeave={(e) => {
                if (isUnlocked) e.currentTarget.style.borderColor = "#238636";
              }}
            >
              {/* Placeholder badge icon */}
              <div style={{
                width: 64, height: 64, margin: "0 auto 12px", borderRadius: "50%",
                background: isUnlocked
                  ? "radial-gradient(circle, rgba(0,255,255,0.15), rgba(0,255,136,0.08))"
                  : "#21262d",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28, color: isUnlocked ? "#00ffff" : "#484f58",
                fontFamily: "monospace", fontWeight: 700,
                border: isUnlocked ? "2px solid #00ffff44" : "2px solid #30363d",
              }}>
                {isUnlocked ? badge.icon : "🔒"}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: isUnlocked ? "#e1e4e8" : "#484f58", marginBottom: 4 }}>
                {badge.title}
              </div>
              <div style={{ fontSize: 11, color: "#8b949e" }}>{badge.requirement}</div>
            </div>
          );
        })}
      </div>

      {/* Badge detail modal */}
      {showModal && selectedBadge && (
        <BadgeModal
          badge={selectedBadge}
          onClose={() => setShowModal(false)}
          safeVolume={MOCK_SAFE_VOLUME}
        />
      )}
    </div>
  );
}

const MOCK_TOP_THRESHOLD = 1000000;

/** Modal overlay for badge details */
function BadgeModal({ badge, onClose, safeVolume }: {
  badge: BadgeData;
  onClose: () => void;
  safeVolume: number;
}) {
  const isUnlocked = safeVolume >= badge.threshold;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.7)", display: "flex",
      alignItems: "center", justifyContent: "center",
    }}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#161b22", borderRadius: 16, padding: 32, maxWidth: 420, width: "90%",
        border: `1px solid ${isUnlocked ? "#238636" : "#30363d"}`,
        boxShadow: `0 0 40px ${isUnlocked ? "rgba(0,255,136,0.1)" : "transparent"}`,
        position: "relative",
      }}>
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 12, right: 16, background: "none", border: "none",
            color: "#8b949e", fontSize: 20, cursor: "pointer",
          }}
        >
          ✕
        </button>

        {/* Badge icon */}
        <div style={{
          width: 100, height: 100, margin: "0 auto 20px", borderRadius: "50%",
          background: isUnlocked
            ? "radial-gradient(circle, rgba(0,255,255,0.2), rgba(0,255,136,0.08))"
            : "repeating-linear-gradient(45deg, #21262d, #21262d 10px, #1c2128 10px, #1c2128 20px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 44, fontFamily: "monospace", fontWeight: 700,
          color: isUnlocked ? "#00ffff" : "#484f58",
          border: isUnlocked ? "3px solid #00ffff" : "3px dashed #30363d",
        }}>
          {isUnlocked ? badge.icon : "🔒"}
        </div>

        <h3 style={{
          fontSize: 20, fontWeight: 700, color: "#e1e4e8", textAlign: "center", marginBottom: 8,
        }}>
          {badge.title}
        </h3>

        <p style={{
          fontSize: 14, color: "#8b949e", textAlign: "center", lineHeight: 1.6, marginBottom: 16,
        }}>
          {badge.description}
        </p>

        <div style={{
          display: "flex", justifyContent: "space-around",
          borderTop: "1px solid #30363d", paddingTop: 16,
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 4 }}>Requirement</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#e1e4e8" }}>{badge.requirement}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#8b949e", marginBottom: 4 }}>Status</div>
            <div style={{
              fontSize: 13, fontWeight: 600,
              color: isUnlocked ? "#238636" : "#da3633",
            }}>
              {isUnlocked ? "✓ Unlocked" : "🔒 Locked"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
