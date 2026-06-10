import { PublicKey } from '@solana/web3.js';

export type DarkProtocolCluster = 'devnet' | 'mainnet-beta';

export interface DarkProtocolEnvConfig {
  cluster: DarkProtocolCluster;
  heliusApiKey?: string;
  jupiterApiKey?: string;
  redpillApiKey?: string;
  xaiApiKey?: string;
  xaiBaseUrl: string;
  xaiModel: string;
  rpcUrl: string;
  programId?: PublicKey;
  commitment: 'processed' | 'confirmed' | 'finalized';
}

function readEnv(name: string): string | undefined {
  const value = typeof process !== 'undefined' ? process.env[name] : undefined;
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function normalizeCluster(value?: string): DarkProtocolCluster {
  return value === 'mainnet-beta' || value === 'mainnet' ? 'mainnet-beta' : 'devnet';
}

export function resolveHeliusRpcUrl(params: {
  cluster?: DarkProtocolCluster;
  heliusApiKey?: string;
  heliusRpcUrl?: string;
  solanaRpcUrl?: string;
}): string {
  if (params.heliusRpcUrl) return params.heliusRpcUrl;
  if (params.solanaRpcUrl) return params.solanaRpcUrl;

  if (params.heliusApiKey) {
    const base = params.cluster === 'mainnet-beta'
      ? 'https://mainnet.helius-rpc.com'
      : 'https://devnet.helius-rpc.com';
    return `${base}/?api-key=${params.heliusApiKey}`;
  }

  return params.cluster === 'mainnet-beta'
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com';
}

export function createDarkProtocolConfigFromEnv(overrides: Partial<DarkProtocolEnvConfig> = {}): DarkProtocolEnvConfig {
  const cluster = overrides.cluster ?? normalizeCluster(
    readEnv('SOLANA_CLUSTER') ??
      (readEnv('HELIUS_RPC_URL')?.includes('mainnet') ? 'mainnet-beta' : undefined),
  );
  const heliusApiKey = overrides.heliusApiKey ?? readEnv('HELIUS_API_KEY');
  const rpcUrl = overrides.rpcUrl ?? resolveHeliusRpcUrl({
    cluster,
    heliusApiKey,
    heliusRpcUrl: readEnv('HELIUS_RPC_URL'),
    solanaRpcUrl: readEnv('SOLANA_RPC_URL'),
  });
  const programIdValue = readEnv('DARK_PROTOCOL_PROGRAM_ID');

  return {
    cluster,
    heliusApiKey,
    jupiterApiKey: overrides.jupiterApiKey ?? readEnv('JUPITER_API_KEY'),
    redpillApiKey: overrides.redpillApiKey ?? readEnv('REDPILL_API_KEY'),
    xaiApiKey: overrides.xaiApiKey ?? readEnv('XAI_API_KEY'),
    xaiBaseUrl: overrides.xaiBaseUrl ?? readEnv('XAI_BASE_URL') ?? 'https://api.x.ai/v1',
    xaiModel: overrides.xaiModel ?? readEnv('XAI_MODEL') ?? 'grok-4.20-beta-latest-non-reasoning',
    rpcUrl,
    programId: overrides.programId ?? (programIdValue ? new PublicKey(programIdValue) : undefined),
    commitment: overrides.commitment ?? 'confirmed',
  };
}
