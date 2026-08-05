
interface Props {
  safeMode: boolean;
  onChange: (v: boolean) => void;
}

export function SafeUnsafeToggle({ safeMode, onChange }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "var(--bg-inset)",
        padding: "6px 14px",
        borderRadius: 8,
        border: "1px solid var(--border)",
      }}
    >
      <span
        style={{
          fontSize: 13,
          color: safeMode ? "var(--green)" : "var(--text-dim)",
          fontWeight: safeMode ? 700 : 400,
        }}
      >
        安全
      </span>
      <div
        role="switch"
        aria-checked={safeMode}
        aria-label={safeMode ? "安全模式" : "非安全模式"}
        onClick={() => onChange(!safeMode)}
        style={{
          width: 44,
          height: 24,
          borderRadius: 12,
          background: safeMode ? "var(--green-dark)" : "var(--red)",
          cursor: "pointer",
          position: "relative",
          transition: "background 0.2s",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "white",
            position: "absolute",
            top: 2,
            left: safeMode ? 22 : 2,
            transition: "left 0.2s",
          }}
        />
      </div>
      <span
        style={{
          fontSize: 13,
          color: !safeMode ? "var(--red)" : "var(--text-dim)",
          fontWeight: !safeMode ? 700 : 400,
        }}
      >
        非安全
      </span>
      <span
        style={{
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 10,
          marginLeft: 4,
          background: safeMode ? "rgba(0, 255, 136, 0.1)" : "rgba(248, 81, 73, 0.1)",
          color: safeMode ? "var(--green)" : "var(--red)",
          border: `1px solid ${safeMode ? "rgba(0, 255, 136, 0.2)" : "rgba(248, 81, 73, 0.2)"}`,
        }}
      >
        当前: {safeMode ? "Agent 保护" : "仅滑点保护"}
      </span>
    </div>
  );
}
