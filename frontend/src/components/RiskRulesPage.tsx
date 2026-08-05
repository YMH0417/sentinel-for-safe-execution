import { useEffect, useState } from "react";
import { api, type RiskConfig } from "../api/client";

const PROFILE_COPY: Record<string, { label: string; tagline: string }> = {
  normal: {
    label: "标准",
    tagline: "日常推荐：在安全和成交率之间取平衡。",
  },
  conservative: {
    label: "保守",
    tagline: "更严格：报价偏差、池子风险稍高就会提醒或拦截。",
  },
  aggressive: {
    label: "激进",
    tagline: "更宽松：仅明显危险时才拦截（演示环境调试用，实盘慎用）。",
  },
};

function profileLabel(key: string): string {
  return PROFILE_COPY[key]?.label ?? key;
}

export function RiskRulesPage() {
  const [config, setConfig] = useState<RiskConfig | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .riskConfig()
      .then(setConfig)
      .catch((e) => setError(e instanceof Error ? e.message : "加载失败"));
  }, []);

  return (
    <div>
      <p className="risk-rules-intro">
        你在兑换页发起交易时，系统会先帮你看一眼路由是否安全，再决定「放行」「建议换路」或「直接拦住」。下面是当前生效的规则说明。
      </p>

      {error && (
        <div className="sentinel-card risk-rules-error">{error}</div>
      )}

      <div className="sentinel-grid-2">
        <div className="sentinel-card">
          <div className="sentinel-label">目标代币怎么看</div>
          <p className="risk-rules-card-hint">
            换出哪种币，比「池子报多高的价」更先被检查。
          </p>
          <RuleRow
            token="USDC"
            level="放心换"
            color="var(--green)"
            desc="演示环境里的基础稳定币，主要检查报价是否合理、池子风险是否可接受。"
          />
          <RuleRow
            token="GOOD"
            level="放心换"
            color="var(--green)"
            desc="演示环境里的正常资产，按常规检查报价偏离与池子风险即可。"
          />
          <RuleRow
            token="BAD"
            level="一律拦截"
            color="var(--red)"
            desc="高风险代币：不管报价多诱人，系统都会直接拒绝这笔兑换。"
          />
          <RuleRow
            token="BAIT"
            level="一律拦截"
            color="var(--red)"
            desc="诱骗型代币：专门用来模拟「看起来能大赚、实际会亏」的场景，永远不放行。"
          />
        </div>

        <div className="sentinel-card">
          <div className="sentinel-label">四种池子分别代表什么</div>
          <p className="risk-rules-card-hint">
            同一条币对可能有多个池；风控助手会根据池子类型给出不同结论。
          </p>
          <RuleRow
            token="SAFE · 安全池"
            level="优先推荐"
            color="var(--green)"
            desc="流动性正常、价格冲击小。有风险时系统也倾向于把你引导到这里成交。"
          />
          <RuleRow
            token="SHALLOW · 浅池"
            level="提高警惕"
            color="var(--yellow)"
            desc="池子较浅，同样金额可能造成较大滑点。分数偏高时会建议换到 SAFE 池。"
          />
          <RuleRow
            token="TOXIC · 毒池"
            level="容易拦截"
            color="var(--red)"
            desc="报价虚高或历史失败率偏高，常见于「诱多」场景，风险分高时会直接拒绝。"
          />
          <RuleRow
            token="SDA · 延迟池"
            level="容易拦截"
            color="var(--red)"
            desc="模拟跨链桥「签完名还要等一阵才能上链」：窗口内报价容易变，通常要求改走 SAFE 池。"
          />
        </div>

        <div className="sentinel-card">
          <div className="sentinel-label">当前全局设置</div>
          {config ? (
            <ul className="risk-rules-list">
              <li>
                <strong>默认严格程度</strong>
                <span>
                  {profileLabel(config.defaultProfile)}
                  {PROFILE_COPY[config.defaultProfile]?.tagline
                    ? ` — ${PROFILE_COPY[config.defaultProfile].tagline}`
                    : ""}
                </span>
              </li>
              <li>
                <strong>评估时会看什么</strong>
                <span>兑出哪种币、走哪个池，以及报价是否偏离公允价、池子历史是否稳定。</span>
              </li>
              <li>
                <strong>最后怎么结论</strong>
                <span>风险低就放行，中等且能换更安全的路就建议换路，明显危险就直接拦住。</span>
              </li>
            </ul>
          ) : (
            <p className="risk-rules-muted">加载中…</p>
          )}
        </div>

        <div className="sentinel-card">
          <div className="sentinel-label">安全模式下的额外保护</div>
          <p className="risk-rules-card-hint">
            走「钱包签名 + 路由合约」的安全路径时，链上还会再验一道，防止页面被篡改后乱发交易。
          </p>
          <ul className="risk-rules-bullet-list">
            <li>
              <strong>系统签名授权</strong> — 只有风控评估通过后，路由合约才接受你的兑换请求。
            </li>
            <li>
              <strong>防重复提交</strong> — 同一授权不能拿来刷第二笔，避免重放攻击。
            </li>
            <li>
              <strong>到手金额下限</strong> — 实际到手低于约定范围时，交易会在链上失败，不会悄悄亏掉。
            </li>
            <li>
              <strong>授权有效期</strong> — 签名过期需重新评估，避免用过期报价成交。
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function RuleRow({
  token,
  level,
  color,
  desc,
}: {
  token: string;
  level: string;
  color: string;
  desc: string;
}) {
  return (
    <div className="risk-rules-row">
      <div className="risk-rules-row-head">
        <strong>{token}</strong>
        <span className="risk-rules-row-badge" style={{ color }}>
          {level}
        </span>
      </div>
      <div className="risk-rules-row-desc">{desc}</div>
    </div>
  );
}
