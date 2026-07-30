import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useWallet } from "../../contexts/WalletContext";
import { useToast } from "../Toast";
import { getAddress } from "ethers";
import { api } from "../../api/client";
import logo from "../../imgs/logo.svg"

const NAV = [
  { to: "/dashboard", label: "仪表盘" },
  { to: "/analysis", label: "Analysis" },
  { to: "/profile", label: "账户与勋章" },
  { to: "/transaction", label: "交易" },
  { to: "/execution", label: "执行结果" },
  { to: "/risk-rules", label: "风控规则" },
  { to: "/settings", label: "设置" },
];

export function AppLayout() {
  const { account, connectWallet, disconnectWallet, isConnecting } = useWallet();
  const { showToast } = useToast();
  const location = useLocation();
  const isLanding = location.pathname === "/";

  useEffect(() => {
    void api.warmCache().catch(() => undefined);
  }, []);

  const handleConnect = async () => {
    try {
      await connectWallet();
      showToast({ type: "success", message: "MetaMask 已连接" });
    } catch (e) {
      showToast({ type: "error", message: e instanceof Error ? e.message : "连接失败" });
    }
  };

  const shortAddr = account
    ? `${getAddress(account).slice(0, 6)}...${getAddress(account).slice(-4)}`
    : null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)" }}>
      <header className="app-header">
        <div className="app-header-inner">
          <img src={logo} alt="" />
          {account && (
            <nav className="app-header-nav">
              {NAV.map((item) => (
                <NavLink
                  key={`${item.to}-${item.label}`}
                  to={item.to}
                  className="app-header-nav-link"
                  style={({ isActive }) => ({
                    color: isActive ? "var(--cyan)" : "var(--text-muted)",
                    background: isActive ? "rgba(0, 255, 255, 0.08)" : "transparent",
                    fontWeight: isActive ? 600 : 400,
                  })}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}

          <div className="app-header-actions">
            {account ? (
              <>
                <span className="app-header-wallet">{shortAddr}</span>
                <button
                  type="button"
                  className="sentinel-btn sentinel-btn-ghost"
                  onClick={disconnectWallet}
                  style={{ padding: "9px 14px", fontSize: 13 }}
                >
                  断开
                </button>
              </>
            ) : (
              <button
                type="button"
                className="sentinel-btn sentinel-btn-primary"
                onClick={handleConnect}
                disabled={isConnecting}
                style={{ padding: "12px 18px", fontSize: 14 }}
              >
                {isConnecting ? "连接中..." : "Connect Wallet"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className={isLanding ? "" : location.pathname === "/dashboard" ? "sentinel-page-dashboard" : "sentinel-page"}>
        <Outlet />
      </main>
    </div>
  );
}
