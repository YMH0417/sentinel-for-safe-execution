
interface Props {
  safeMode: boolean;
  onChange: (v: boolean) => void;
}

export function SafeUnsafeToggle({ safeMode, onChange }: Props) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      background: "#161b22",
      padding: "6px 12px",
      borderRadius: 8,
      border: "1px solid #30363d",
    }}>
      <span style={{ fontSize: 13, color: "#8b949e" }}>Unsafe Mode</span>
      <div
        onClick={() => onChange(!safeMode)}
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          background: safeMode ? "#238636" : "#da3633",
          cursor: "pointer",
          position: "relative",
          transition: "background 0.2s",
        }}
      >
        <div style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: "white",
          position: "absolute",
          top: 2,
          left: safeMode ? 20 : 2,
          transition: "left 0.2s",
        }} />
      </div>
      <span style={{ fontSize: 13, color: "#8b949e" }}>Safe Mode</span>
    </div>
  );
}
