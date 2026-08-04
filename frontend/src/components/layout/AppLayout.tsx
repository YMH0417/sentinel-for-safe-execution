import { NavLink, Outlet } from "react-router-dom";
import { useEffect } from "react";
import { api } from "../../api/client";
import logo from "../../imgs/logo.svg";
import { WalletAvatar } from "../WalletAvatar";
import { ThemeToggle } from "../ThemeToggle";

const NAV = [
  { to: "/dashboard", label: "仪表盘" },
  { to: "/analysis", label: "Analysis" },
  { to: "/transaction", label: "交易" },
  { to: "/risk-rules", label: "风控规则" },
  { to: "/settings", label: "设置" },
];

export function AppLayout() {
  useEffect(() => {
    void api.warmCache().catch(() => undefined);
  }, []);


  return (
    <div className="app-layout-root">
      <header className="app-header">
        <div className="app-header-inner">
          <NavLink to="/" className="app-header-brand" aria-label="返回首页">
            <img src={logo} alt="Sentinel" />
          </NavLink>
          <nav className="app-header-nav">
            {NAV.map((item) => (
              <NavLink
                key={`${item.to}-${item.label}`}
                to={item.to}
                className="app-header-nav-link"
                style={({ isActive }) => ({
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--cyan)" : "var(--text-nav)",
                })}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="app-header-actions">
            <ThemeToggle />
            <WalletAvatar />
          </div>
        </div>
      </header>

      <main className="sentinel-page">
        <Outlet />
      </main>
    </div>
  );
}
