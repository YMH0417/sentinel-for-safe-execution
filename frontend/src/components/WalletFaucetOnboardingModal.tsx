import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { useWallet } from "../contexts/WalletContext";

const MONAD_FAUCET_URL = "https://faucet.monad.xyz/";

export function WalletFaucetOnboardingModal() {
  const { account, faucetOnboardingOpen, dismissFaucetOnboarding } = useWallet();
  const { pathname } = useLocation();

  const visible = Boolean(account && faucetOnboardingOpen && pathname !== "/faucet");

  useEffect(() => {
    if (!visible) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissFaucetOnboarding();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [visible, dismissFaucetOnboarding]);

  if (!visible) return null;

  return createPortal(
    <div className="wallet-onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="wallet-onboarding-title">
      <button
        type="button"
        className="wallet-onboarding-close"
        onClick={dismissFaucetOnboarding}
        aria-label="关闭"
      >
        ✕
      </button>

      <div className="wallet-onboarding-panel sentinel-card">
        <h2 id="wallet-onboarding-title" className="wallet-onboarding-title">
          连接成功
        </h2>
        <p className="wallet-onboarding-lead">
          在使用 Sentinel 发起交易前，请先到<strong>测试网资产</strong>页面领取 Gas 与演示代币。
        </p>

        <ul className="wallet-onboarding-list">
          <li>
            <strong>MON</strong> — Monad 测试网原生代币，用于支付 swap、授权等链上操作的 Gas。
            可在{" "}
            <a href={MONAD_FAUCET_URL} target="_blank" rel="noopener noreferrer">
              Monad 官方水龙头
            </a>{" "}
            领取，或在测试网资产页按指引操作。
          </li>
          <li>
            <strong>USDC</strong> — 演示用稳定币，用于在本站进行安全交易演示（每次可领 10,000）。
          </li>
        </ul>

        <div className="wallet-onboarding-actions">
          <Link
            to="/faucet"
            className="sentinel-btn sentinel-btn-primary wallet-onboarding-primary"
            onClick={dismissFaucetOnboarding}
          >
            前往测试网资产
          </Link>
          <button type="button" className="sentinel-btn sentinel-btn-ghost" onClick={dismissFaucetOnboarding}>
            我知道了
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
