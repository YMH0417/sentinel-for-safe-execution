import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { DashboardPage } from './components/DashboardPage';
import { TransactionPage } from './components/TransactionPage';
import { UserProfilePage } from './components/UserProfilePage';
import { ExecutionResultPage } from './components/ExecutionResultPage';
import { RiskRulesPage } from './components/RiskRulesPage';
import { FaucetPage } from './components/FaucetPage';
import { SettingsPage } from './components/SettingsPage';
import { ToastProvider } from './components/Toast';
import { AuthRoute } from './components/AuthRoute';
import { AppLayout } from './components/layout/AppLayout';
import { WalletProvider } from './contexts/WalletContext';

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
              <Route
                path="/transaction"
                element={
                  <AuthRoute>
                    <TransactionRouter />
                  </AuthRoute>
                }
              />
              <Route
                path="/execution"
                element={
                  <AuthRoute>
                    <ExecutionResultPage />
                  </AuthRoute>
                }
              />
              <Route
                path="/risk-rules"
                element={
                  <AuthRoute>
                    <RiskRulesPage />
                  </AuthRoute>
                }
              />
              <Route
                path="/profile"
                element={
                  <AuthRoute>
                    <UserProfilePage />
                  </AuthRoute>
                }
              />
              <Route
                path="/faucet"
                element={
                  <AuthRoute>
                    <FaucetPage />
                  </AuthRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <AuthRoute>
                    <SettingsPage />
                  </AuthRoute>
                }
              />
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

  return <TransactionPage safeMode={safeMode} onSafeModeChange={setSafeMode} />;
}
