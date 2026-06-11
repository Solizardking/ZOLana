import { FC, ReactNode, useMemo } from 'react';
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { getDarkRuntimeConfig, resolveSolanaRpcUrl } from '../utils/runtime';

interface WalletProviderProps {
  children: ReactNode;
}

const WalletProvider: FC<WalletProviderProps> = ({ children }) => {
  const runtime = useMemo(() => getDarkRuntimeConfig(), []);
  const endpoint = useMemo(
    () => resolveSolanaRpcUrl(runtime.defaultNetwork, runtime),
    [runtime],
  );

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
};

export default WalletProvider;
