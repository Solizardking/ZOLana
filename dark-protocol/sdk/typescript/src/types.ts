import { PublicKey } from '@solana/web3.js';

export interface DarkProtocol {
  // Program type definition
}

export interface ShieldedAddress {
  owner: PublicKey;
  viewingKey: Uint8Array;
  spendingKeyCommitment: Uint8Array;
  diversifier: Uint8Array;
  createdAt: number;
  bump: number;
}

export interface Note {
  commitment: Uint8Array;
  nullifierHash: Uint8Array;
  amount: bigint;
  tokenMint: PublicKey;
  encryptedMemo: Uint8Array;
  createdAt: number;
  spent: boolean;
  bump: number;
}

export interface PrivacyPool {
  totalDeposited: bigint;
  totalWithdrawn: bigint;
  activeCommitments: bigint;
  tokenMint: PublicKey;
  minDeposit: bigint;
  maxDeposit: bigint;
  feeBps: number;
  bump: number;
}

export interface AIAgent {
  agentPubkey: PublicKey;
  owner: PublicKey;
  teeAttestationHash: Uint8Array;
  capabilities: Uint8Array;
  trustScore: number;
  totalActions: bigint;
  successfulActions: bigint;
  registeredAt: number;
  lastActionAt: number;
  isActive: boolean;
  bump: number;
}

export interface ZKProof {
  proofA: Uint8Array;
  proofB: Uint8Array;
  proofC: Uint8Array;
}

export interface PrivateTransferParams {
  inputNullifiers: Uint8Array[];
  outputCommitments: Uint8Array[];
  proof: Uint8Array;
  encryptedMemo: Uint8Array;
}

export interface PrivatePaymentParams {
  rail: 'x402' | 'ap2' | 'm2m';
  settlement: 'solana' | 'evm';
  proofLayer: 'solana' | 'evm';
  durableReceipt: boolean;
  paymentCommitment: Uint8Array;
}

export interface PrivateSwapParams {
  inputAmount: bigint;
  inputCommitment: Uint8Array;
  outputCommitment: Uint8Array;
  nullifier: Uint8Array;
  proof: Uint8Array;
  jupiterRoutePlan: Uint8Array;
}

export enum TransactionType {
  Shield = 'Shield',
  Unshield = 'Unshield',
  PrivateTransfer = 'PrivateTransfer',
  PrivatePayment = 'PrivatePayment',
  PrivateSwap = 'PrivateSwap',
  PoolDeposit = 'PoolDeposit',
  PoolWithdraw = 'PoolWithdraw',
}

export enum PrivacyLevel {
  Full = 'Full',
  Partial = 'Partial',
  Minimal = 'Minimal',
}

export interface JupiterSwapRoute {
  inputMint: PublicKey;
  outputMint: PublicKey;
  inputAmount: bigint;
  outputAmount: bigint;
  otherAmountThreshold: bigint;
  swapMode: 'ExactIn' | 'ExactOut';
  slippageBps: number;
  platformFeeBps: number;
  priceImpactPct: number;
  routePlan: RoutePlanStep[];
}

export interface RoutePlanStep {
  swap: any;
  percent: number;
  inputIndex: number;
  outputIndex: number;
}

export interface TEEAttestation {
  measurement: Uint8Array;
  timestamp: number;
  signature: Uint8Array;
}

export interface WalletState {
  shieldedBalance: bigint;
  transparentBalance: bigint;
  notes: Note[];
  pendingNotes: Note[];
  shieldedAddress?: ShieldedAddress;
}

export interface AIAgentCapability {
  type: 'swap' | 'transfer' | 'pool' | 'analyze';
  enabled: boolean;
  maxAmount?: bigint;
  requiresApproval: boolean;
}
