interface Props {
  tokenIn: string;
  tokenOut: string;
  amount: string;
  onTokenInChange: (v: string) => void;
  onTokenOutChange: (v: string) => void;
  onAmountChange: (v: string) => void;
  onLoad: () => void;
  loading: string;
}

const DEMO_TOKENS = ["USDC", "GOOD", "BAD", "BAIT"] as const;

export function InputPanel({
  tokenIn, tokenOut, amount,
  onTokenInChange, onTokenOutChange, onAmountChange,
  onLoad, loading,
}: Props) {
  return (
    <div style={{
      background: "#161b22",
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
      border: "1px solid #30363d",
    }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#8b949e", textTransform: "uppercase", letterSpacing: 1 }}>
        Input
      </h3>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#8b949e", marginBottom: 4 }}>支付代币</label>
          <select value={tokenIn} onChange={e => onTokenInChange(e.target.value)} style={inputStyle}>
            {DEMO_TOKENS.map((t) => (
              <option key={t} value={t} disabled={t === tokenOut}>{t}</option>
            ))}
            <option value="USDT">USDT (mock only)</option>
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#8b949e", marginBottom: 4 }}>获得代币</label>
          <select value={tokenOut} onChange={e => onTokenOutChange(e.target.value)} style={inputStyle}>
            {DEMO_TOKENS.map((t) => (
              <option key={t} value={t} disabled={t === tokenIn}>{t}</option>
            ))}
            <option value="USDC_MOCK">USDC (mock legacy)</option>
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, color: "#8b949e", marginBottom: 4 }}>兑换数量</label>
          <input
            type="number"
            value={amount}
            onChange={e => onAmountChange(e.target.value)}
            style={inputStyle}
          />
        </div>
        <button
          onClick={onLoad}
          disabled={!!loading}
          style={{
            ...btnStyle,
            background: "#21262d",
            border: "1px solid #30363d",
          }}
        >
          Get Quote
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "#0d1117",
  border: "1px solid #30363d",
  borderRadius: 8,
  color: "#e1e4e8",
  padding: "8px 12px",
  fontSize: 14,
  minWidth: 120,
  outline: "none",
};

const btnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "none",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  color: "#e1e4e8",
};
