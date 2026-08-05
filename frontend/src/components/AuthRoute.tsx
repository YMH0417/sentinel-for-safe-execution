import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../contexts/WalletContext";
import { GlobalLoading } from "./GlobalLoading";

interface Props {
  children: React.ReactNode;
}

/**
 * AuthRoute — guards authenticated routes. Waits for MetaMask session restore
 * on refresh before redirecting unauthenticated users to /.
 */
export function AuthRoute({ children }: Props) {
  const navigate = useNavigate();
  const { account, isWalletReady } = useWallet();

  useEffect(() => {
    if (!isWalletReady) return;
    if (!account) {
      navigate("/", { replace: true });
    }
  }, [account, isWalletReady, navigate]);

  if (!isWalletReady) {
    return <GlobalLoading active message="正在恢复钱包连接…" />;
  }

  if (!account) return null;

  return <>{children}</>;
}
