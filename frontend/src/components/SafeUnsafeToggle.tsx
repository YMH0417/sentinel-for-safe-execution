
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
        background: "#161b22",
        padding: "6px 14px",
        borderRadius: 8,
        border: "1px solid #30363d",
      }}
    >
      <span
        style={{
          fontSize: 13,
          color: safeMode ? "#3fb950" : "#484f58",
          fontWeight: safeMode ? 700 : 400,
        }}
      >
        Safe
      </span>
      <div
        role="switch"
        aria-checked={safeMode}
        aria-label={safeMode ? "Safe Mode" : "Unsafe Mode"}
        onClick={() => onChange(!safeMode)}
        style={{
          width: 44,
          height: 24,
          borderRadius: 12,
          background: safeMode ? "#238636" : "#da3633",
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
          color: !safeMode ? "#f85149" : "#484f58",
          fontWeight: !safeMode ? 700 : 400,
        }}
      >
        Unsafe
      </span>
      <span
        style={{
          fontSize: 11,
          padding: "2px 8px",
          borderRadius: 10,
          marginLeft: 4,
          background: safeMode ? "rgba(35,134,54,0.15)" : "rgba(218,54,51,0.15)",
          color: safeMode ? "#3fb950" : "#f85149",
          border: `1px solid ${safeMode ? "rgba(35,134,54,0.35)" : "rgba(218,54,51,0.35)"}`,
        }}
      >
        当前: {safeMode ? "Agent 保护" : "仅滑点保护"}
      </span>
    </div>
  );
}
