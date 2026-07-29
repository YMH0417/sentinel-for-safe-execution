interface Props {
  score: number;
  size?: number;
  label?: string;
}

export function SecurityGauge({ score, size = 140, label = "安全评分" }: Props) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color = score >= 70 ? "var(--green)" : score >= 40 ? "var(--yellow)" : "var(--red)";

  return (
    <div style={{ textAlign: "center" }}>
      <div className="sentinel-label">{label}</div>
      <svg width={size} height={size} style={{ display: "block", margin: "0 auto" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1e2d3d"
          strokeWidth={10}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeDasharray={`${progress} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="46%"
          textAnchor="middle"
          fill="var(--text)"
          fontSize={28}
          fontWeight={700}
          fontFamily="var(--font-display)"
        >
          {score}
        </text>
        <text x="50%" y="58%" textAnchor="middle" fill="var(--text-muted)" fontSize={12}>
          / 100
        </text>
      </svg>
    </div>
  );
}
