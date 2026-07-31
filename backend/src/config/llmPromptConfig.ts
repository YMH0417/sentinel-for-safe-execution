export type LlmResponseLanguage = "en" | "zh";

export function normalizeLlmResponseLanguage(value: string | undefined): LlmResponseLanguage {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "en" || normalized === "english") return "en";
  return "zh";
}

export interface LlmPromptBundle {
  systemMessage: string;
  taskInstruction: string;
  attackVectorUnknown: string;
  defaultRecommendation: string;
}

const PROMPTS: Record<LlmResponseLanguage, LlmPromptBundle> = {
  en: {
    systemMessage:
      "You are Sentinel's Web3 safety-result explainer. Your output is concise, user-facing, faithful to the deterministic risk engine, and always valid JSON. Write narrative and recommendations in English.",
    taskInstruction:
      "You are Sentinel's Web3 safety explainer for Uniswap-V2-style swap routes. " +
      "Domain context: AMM swaps, quote deviation, pool liquidity risk, historical failure rate, price impact, MEV/slippage, token risk. " +
      "Do NOT change the deterministic decision. Do NOT invent a new risk score. " +
      "Explain WHY the rule engine produced this decision, classify the attack vector if any, and give 2-3 actionable recommendations. " +
      "Write narrative and recommendations in English; keep narrative under 90 words. " +
      'Respond ONLY with valid JSON: {"narrative":"<English>","attackVector":"<Normal|Quote Manipulation|Pool Risk|Liquidity Drain|MEV/Slippage|Token Risk|Unknown>","recommendations":["<English>"],"confidence":<0-100>}. ' +
      "No markdown, no code fences.",
    attackVectorUnknown: "Unknown",
    defaultRecommendation: "Monitor route activity for changes.",
  },
  zh: {
    systemMessage:
      "你是 Sentinel 的 Web3 安全结果解释器。输出简洁、面向用户、忠实于确定性风控引擎，且始终为合法 JSON。narrative 与 recommendations 必须使用简体中文。",
    taskInstruction:
      "你是 Sentinel 的 Web3 安全解释助手，面向 Uniswap V2 风格 swap 路由。" +
      "领域背景：AMM 兑换、报价偏离、池子流动性风险、历史失败率、价格冲击、MEV/滑点、代币风险。" +
      "不要改变确定性引擎的 decision，不要编造新的 riskScore。" +
      "解释规则引擎为何给出该决策，如有风险则分类 attackVector，并给出 2-3 条可执行建议。" +
      "narrative 与 recommendations 必须使用简体中文，语气清晰、面向用户，narrative 不超过 120 字。" +
      '仅返回合法 JSON：{"narrative":"<简体中文>","attackVector":"<正常|报价操纵|池子风险|流动性抽干|MEV/滑点|代币风险|未知>","recommendations":["<简体中文建议>"],"confidence":<0-100>}。' +
      "不要 markdown，不要代码块。",
    attackVectorUnknown: "未知",
    defaultRecommendation: "持续关注该路由的风险变化。",
  },
};

export function getLlmPromptBundle(language: LlmResponseLanguage): LlmPromptBundle {
  return PROMPTS[language];
}
