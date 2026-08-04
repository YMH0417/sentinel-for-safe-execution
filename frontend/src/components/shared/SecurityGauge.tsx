interface Props {
  score: number;
  size?: number;
  label?: string;
}

export function SecurityGauge({ score, size = 180, label = "安全评分" }: Props) {
  const stroke = 12;
  const radius = (size - stroke * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = score >= 70 ? "var(--cyan)" : score >= 40 ? "var(--yellow)" : "var(--red)";
  const gradId = `gauge-grad-${score >= 70 ? "ok" : score >= 40 ? "warn" : "bad"}`;
  const glowId = `gauge-glow-${score >= 70 ? "ok" : score >= 40 ? "warn" : "bad"}`;

  return (
    <div className="security-gauge-wrap">
      {label && <div className="sentinel-label">{label}</div>}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: "block", margin: "0 auto" }}
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.6" />
          </linearGradient>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--bg-inset)"
          strokeWidth={stroke}
        />

        {/* Progress ring with glow */}
        <circle
          className="security-gauge-arc"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          filter={`url(#${glowId})`}
          style={{ ["--gauge-target" as string]: progress }}
        />

        {/* Center text */}
        <text
          x="50%"
          y="46%"
          textAnchor="middle"
          fill="var(--text)"
          fontSize={36}
          fontWeight={700}
          fontFamily="var(--font-display)"
          className="security-gauge-score-text"
        >
          {score}
        </text>
        <text x="50%" y="60%" textAnchor="middle" fill="var(--text-muted)" fontSize={13}>
          / 100
        </text>
      </svg>
      <div className="security-gauge-sublabel">综合评估分数</div>
    </div>
  );
}
