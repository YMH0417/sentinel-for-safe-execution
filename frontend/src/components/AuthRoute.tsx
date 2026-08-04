import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../contexts/WalletContext";

interface Props {
  children: React.ReactNode;
}

/**
 * AuthRoute — guards authenticated routes. If no wallet is connected,
 * immediately redirect to /.
 */
export function AuthRoute({ children }: Props) {
  const navigate = useNavigate();
  const { account } = useWallet();

  useEffect(() => {
    if (!account) {
      navigate("/", { replace: true });
    }
  }, [account, navigate]);

  // Not authenticated — render nothing (redirect is in flight)
  if (!account) return null;

  return <>{children}</>;
}
