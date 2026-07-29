import { useEffect, useState } from "react";
import { api, type RiskConfig } from "../api/client";

export function RiskRulesPage() {
  const [config, setConfig] = useState<RiskConfig | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.riskConfig()
      .then(setConfig)
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  return (
    <div>
      <h2 className="sentinel-title">风控规则</h2>
      <p style={{ color: "var(--text-muted)", marginBottom: 24, fontSize: 14 }}>
        Demo 阶段规则来自 backend 配置与 Agent 硬编码策略（只读展示）。
      </p>

      {error && <div className="sentinel-card" style={{ color: "var(--red)", marginBottom: 16 }}>{error}</div>}

      <div className="sentinel-grid-2">
        <div className="sentinel-card">
          <div className="sentinel-label">全局配置</div>
          {config ? (
            <ul style={{ listStyle: "none", fontSize: 14, lineHeight: 2 }}>
              <li>默认 Profile：<strong>{config.defaultProfile}</strong></li>
              <li>系统暂停：<strong style={{ color: config.paused ? "var(--red)" : "var(--green)" }}>{config.paused ? "是" : "否"}</strong></li>
              <li>最大滑点：<strong>{config.maxSlippageBps ?? 100} bps</strong></li>
            </ul>
          ) : (
            <p style={{ color: "var(--text-dim)" }}>加载中...</p>
          )}
        </div>

        <div className="sentinel-card">
          <div className="sentinel-label">代币风险标签</div>
          <RuleRow token="USDC / GOOD" level="安全" color="var(--green)" desc="正常交易代币" />
          <RuleRow token="BAD" level="高风险" color="var(--red)" desc="tokenOut 为 BAD → Agent REJECT" />
          <RuleRow token="BAIT" level="诱饵" color="var(--red)" desc="tokenOut 为 BAIT → Agent REJECT" />
        </div>

        <div className="sentinel-card">
          <div className="sentinel-label">池类型策略</div>
          <RuleRow token="SAFE" level="推荐" color="var(--green)" desc="低冲击，作 fallback 目标" />
          <RuleRow token="SHALLOW" level="警告" color="var(--yellow)" desc="高价格冲击，风险分升高" />
          <RuleRow token="TOXIC" level="Fallback" color="var(--yellow)" desc="可触发切换到同币对 SAFE 池" />
        </div>

        <div className="sentinel-card">
          <div className="sentinel-label">Vault 硬约束</div>
          <ul style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.9, paddingLeft: 18 }}>
            <li>EIP-712 Agent 签名 permit</li>
            <li>nonce 防重放</li>
            <li>maxLossBps 滑点/损失上限</li>
            <li>deadline 过期拒绝</li>
            <li>pause 全局暂停</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function RuleRow({ token, level, color, desc }: { token: string; level: string; color: string; desc: string }) {
  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid #1a2332" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>{token}</strong>
        <span style={{ color, fontSize: 12, fontWeight: 600 }}>{level}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>{desc}</div>
    </div>
  );
}
