import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { DashboardPage } from './components/DashboardPage';
import { TransactionPage } from './components/TransactionPage';
import { UserProfilePage } from './components/UserProfilePage';
import { ExecutionResultPage } from './components/ExecutionResultPage';
import { RiskRulesPage } from './components/RiskRulesPage';
import { SettingsPage } from './components/SettingsPage';
import { AnalysisPage } from './components/AnalysisPage';
import { ToastProvider } from './components/Toast';
import { AuthRoute } from './components/AuthRoute';
import { AppLayout } from './components/layout/AppLayout';
import { SafeUnsafeToggle } from './components/SafeUnsafeToggle';
import { WalletProvider } from './contexts/WalletContext';
import { fetchDemoChainConfig } from './lib/wallet';

export default function App() {
  return (
    <WalletProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<LandingPage />} />
              <Route
                path="/dashboard"
                element={
                  <AuthRoute>
                    <DashboardPage />
                  </AuthRoute>
                }
              />
              <Route path="/transaction" element={<TransactionRouter />} />
              <Route path="/execution" element={<ExecutionResultPage />} />
              <Route path="/risk-rules" element={<RiskRulesPage />} />
              <Route path="/analysis" element={<AnalysisPage />} />
              <Route
                path="/profile"
                element={
                  <AuthRoute>
                    <UserProfilePage />
                  </AuthRoute>
                }
              />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </WalletProvider>
  );
}

function TransactionRouter() {
  const [safeMode, setSafeMode] = useState(true);
  const [demoBanner, setDemoBanner] = useState<string | null>(null);

  useEffect(() => {
    void fetchDemoChainConfig().then((chain) => {
      if (!chain) {
        setDemoBanner(null);
        return;
      }
      setDemoBanner(
        `请用 MetaMask 连接钱包并切换到 ${chain.chainName}（Chain ID ${chain.chainId}，RPC ${chain.rpcUrl}，${chain.nativeCurrency.symbol}）。` +
          `执行 swap 前会弹出 Approve 授权；请使用已注资的测试钱包 0x8819…b2c。`
      );
    });
  }, []);

  return (
    <>
      {demoBanner ? (
        <div
          className="sentinel-card"
          style={{
            marginBottom: 20,
            padding: "12px 16px",
            borderColor: "rgba(210, 153, 34, 0.35)",
            background: "rgba(210, 153, 34, 0.06)",
            fontSize: 13,
            color: "var(--yellow)",
            lineHeight: 1.5,
          }}
        >
          <strong>Demo 链模式</strong> — {demoBanner}
        </div>
      ) : null}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 className="sentinel-title" style={{ margin: 0 }}>交易检测</h2>
        <SafeUnsafeToggle safeMode={safeMode} onChange={setSafeMode} />
      </div>
      <TransactionPage safeMode={safeMode} />
    </>
  );
}
