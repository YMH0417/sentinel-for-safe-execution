import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { DashboardPage } from './components/DashboardPage';
import { TransactionPage } from './components/TransactionPage';
import { UserProfilePage } from './components/UserProfilePage';
import { ToastProvider } from './components/Toast';
import { AuthRoute } from './components/AuthRoute';
import { AppHeader } from './components/AppHeader';
import { SafeUnsafeToggle } from './components/SafeUnsafeToggle';
import { WalletProvider } from './contexts/WalletContext';

export default function App() {
  return (
    <WalletProvider>
      <ToastProvider>
        <BrowserRouter>
          <div style={{ padding: '0 24px', maxWidth: 1200, margin: '0 auto' }}>
            <AppHeader />
            <Routes>
              <Route path='/' element={<LandingPage />} />
              <Route
                path='/dashboard'
                element={
                  <AuthRoute>
                    <DashboardRouter />
                  </AuthRoute>
                }
              />
              <Route
                path='/transaction'
                element={<TransactionRouter />}
              />
              <Route
                path='/profile'
                element={
                  <AuthRoute>
                    <UserProfilePage />
                  </AuthRoute>
                }
              />
              <Route path='*' element={<Navigate to='/' replace />} />
            </Routes>
          </div>
        </BrowserRouter>
      </ToastProvider>
    </WalletProvider>
  );
}

/** DashboardRouter */
function DashboardRouter() {
  return <DashboardPage />;
}

/** TransactionRouter — safeMode toggle only appears here */
function TransactionRouter() {
  const [safeMode, setSafeMode] = useState(true);
  return (
    <>
      <div style={{
        marginBottom: 16,
        padding: "10px 16px",
        borderRadius: 8,
        background: "#d2992211",
        border: "1px solid #d2992244",
        fontSize: 13,
        color: "#d29922",
        lineHeight: 1.5,
      }}>
        <strong>Demo 模式</strong> — 当前使用模拟路由数据，无需真实资金。连接钱包仅在实际执行（Execute）时需要；获取报价和风险评估可游客预览。
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e1e4e8' }}>交易检测</h2>
        <SafeUnsafeToggle safeMode={safeMode} onChange={setSafeMode} />
      </div>
      <TransactionPage safeMode={safeMode} />
    </>
  );
}
