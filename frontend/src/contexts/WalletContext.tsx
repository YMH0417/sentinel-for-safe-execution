import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { getAddress } from "ethers";
import { connectMetaMaskWallet, restoreMetaMaskSession, revokeMetaMaskAccess } from "../lib/wallet";
import { getErrorMessage } from "../lib/errorMessage";

interface WalletContextValue {
  account: string | null;
  isConnecting: boolean;
  /** False until the initial eth_accounts probe finishes (page load / refresh). */
  isWalletReady: boolean;
  /** Shown when wallet is connected (explicit connect or MetaMask session restore). */
  faucetOnboardingOpen: boolean;
  dismissFaucetOnboarding: () => void;
  setAccount: (account: string | null) => void;
  /** MetaMask eth_requestAccounts + switch/add demo chain when in demo mode */
  connectWallet: () => Promise<string>;
  disconnectWallet: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccountState] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isWalletReady, setIsWalletReady] = useState(false);
  const [faucetOnboardingOpen, setFaucetOnboardingOpen] = useState(false);
  /** In-memory: user dismissed onboarding for this address (avoids MetaMask accountsChanged re-opening). */
  const onboardingDismissedForRef = useRef<string | null>(null);

  const tryOpenFaucetOnboarding = useCallback((address: string) => {
    try {
      const checksum = getAddress(address);
      if (onboardingDismissedForRef.current === checksum) return;
      setFaucetOnboardingOpen(true);
    } catch {
      setFaucetOnboardingOpen(true);
    }
  }, []);

  const setAccount = useCallback((a: string | null) => {
    setAccountState(a);
    window.dispatchEvent(new CustomEvent("sentinel:wallet:change"));
  }, []);

  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    try {
      const address = await connectMetaMaskWallet();
      setAccount(address);
      onboardingDismissedForRef.current = null;
      setFaucetOnboardingOpen(true);
      return address;
    } catch (err) {
      throw new Error(getErrorMessage(err, "连接 MetaMask 失败"));
    } finally {
      setIsConnecting(false);
    }
  }, [setAccount]);

  const dismissFaucetOnboarding = useCallback(() => {
    if (account) {
      try {
        onboardingDismissedForRef.current = getAddress(account);
      } catch {
        onboardingDismissedForRef.current = account;
      }
    }
    setFaucetOnboardingOpen(false);
  }, [account]);

  const disconnectWallet = useCallback(() => {
    void revokeMetaMaskAccess();
    setFaucetOnboardingOpen(false);
    onboardingDismissedForRef.current = null;
    setAccount(null);
  }, [setAccount]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const restored = await restoreMetaMaskSession();
      if (cancelled) return;
      if (restored) {
        setAccount(restored);
        tryOpenFaucetOnboarding(restored);
      }
      setIsWalletReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [setAccount, tryOpenFaucetOnboarding]);

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;

    const onAccountsChanged = (accounts: unknown) => {
      const list = accounts as string[];
      if (!list?.length) {
        setAccount(null);
        setFaucetOnboardingOpen(false);
        return;
      }
      try {
        const next = getAddress(list[0]);
        setAccount(next);
        tryOpenFaucetOnboarding(next);
      } catch {
        setAccount(list[0] ?? null);
      }
    };

    const onChainChanged = () => {
      void (async () => {
        try {
          const list = (await eth.request({ method: "eth_accounts" })) as string[];
          if (!list?.length) {
            setAccount(null);
            return;
          }
          setAccount(getAddress(list[0]));
        } catch {
          setAccount(null);
        }
      })();
    };

    eth.on?.("accountsChanged", onAccountsChanged);
    eth.on?.("chainChanged", onChainChanged);

    return () => {
      eth.removeListener?.("accountsChanged", onAccountsChanged);
      eth.removeListener?.("chainChanged", onChainChanged);
    };
  }, [setAccount, tryOpenFaucetOnboarding]);

  return (
    <WalletContext.Provider
      value={{
        account,
        isConnecting,
        isWalletReady,
        faucetOnboardingOpen,
        dismissFaucetOnboarding,
        setAccount,
        connectWallet,
        disconnectWallet,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within <WalletProvider>");
  return ctx;
}
