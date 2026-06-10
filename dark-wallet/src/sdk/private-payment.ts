export type PrivatePaymentRail = 'x402' | 'ap2' | 'm2m';
export type PrivatePaymentSettlement = 'solana' | 'evm';
export type PrivatePaymentProofLayer = 'solana' | 'evm';
export type PrivatePaymentStatus = 'queued' | 'anchored' | 'failed';

export interface PrivatePaymentRequest {
  amountSol: number;
  recipient: string;
  rail: PrivatePaymentRail;
  settlement: PrivatePaymentSettlement;
  proofLayer: PrivatePaymentProofLayer;
  durableReceipt: boolean;
  memo?: string;
}

export interface PrivatePaymentReceipt extends PrivatePaymentRequest {
  id: string;
  createdAt: number;
  updatedAt?: number;
  status: PrivatePaymentStatus;
  amountLamports: string;
  commitment: string;
  commitmentHex: string;
  nonce: string;
  solanaAnchor?: PrivatePaymentSolanaAnchor;
  solanaVerification?: PrivatePaymentSolanaVerification;
  lastError?: string;
}

export interface PrivatePaymentSolanaAnchor {
  signature: string;
  cluster: 'devnet' | 'mainnet-beta';
  explorerUrl: string;
  payer?: string;
  anchoredAt: number;
  commitment: 'processed' | 'confirmed' | 'finalized';
}

export interface PrivatePaymentSolanaVerification {
  verifiedAt: number;
  signature: string;
  slot: number;
  blockTime?: number | null;
  payer: string;
  memoMatched: boolean;
}

export interface PrivatePaymentEvmIntentProof {
  domain: 'zolana.dark.evm-intent';
  version: '1';
  digest: string;
  eip712: {
    domain: {
      name: 'ZOLana Dark Private Payment';
      version: '1';
      chainId: number;
      verifyingContract?: string;
    };
    primaryType: 'PrivatePaymentIntent';
    types: {
      PrivatePaymentIntent: Array<{ name: string; type: string }>;
    };
    message: {
      receiptId: string;
      rail: PrivatePaymentRail;
      settlement: PrivatePaymentSettlement;
      proofLayer: PrivatePaymentProofLayer;
      durableReceipt: boolean;
      recipient: string;
      amountLamports: string;
      commitmentHex: string;
      nonce: string;
      memoHash: string;
      solanaSignature: string;
      solanaCluster: string;
      createdAt: string;
    };
  };
}

export interface PrivatePaymentProofPayload {
  domain: 'zolana.dark.private-payment';
  version: '1';
  receiptId: string;
  rail: PrivatePaymentRail;
  settlement: PrivatePaymentSettlement;
  proofLayer: PrivatePaymentProofLayer;
  durableReceipt: boolean;
  recipient: string;
  amountLamports: string;
  commitmentHex: string;
  nonce: string;
  createdAt: number;
  status: PrivatePaymentStatus;
  solanaAnchor?: PrivatePaymentSolanaAnchor;
  solanaVerification?: PrivatePaymentSolanaVerification;
  memoHash?: string;
  evmIntentProof: PrivatePaymentEvmIntentProof;
}

export interface PrivatePaymentProofOptions {
  evmChainId?: number;
  evmVerifyingContract?: string;
}

const PRIVATE_PAYMENT_STORAGE_KEY = 'zolana:dark-wallet:private-payments:v1';
const MAX_PRIVATE_PAYMENT_RECEIPTS = 32;

function randomHex(bytes: number): string {
  const data = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(data);
  } else {
    for (let index = 0; index < data.length; index += 1) {
      data[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(data, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function stableHex(input: string, bytes = 32): string {
  const output = new Uint8Array(bytes);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= code + index;
    h2 = Math.imul(h2, 0x85ebca6b);
  }

  for (let index = 0; index < output.length; index += 1) {
    h1 ^= h2 + index;
    h1 = Math.imul(h1, 0xc2b2ae35);
    h2 ^= h1 >>> 13;
    output[index] = (h1 ^ h2 ^ (h1 >>> 16)) & 0xff;
  }

  return Array.from(output, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function amountSolToLamports(amountSol: number): string {
  return BigInt(Math.round(amountSol * 1_000_000_000)).toString();
}

function isBrowserStorageAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

export function stagePrivatePayment(request: PrivatePaymentRequest): PrivatePaymentReceipt {
  if (!Number.isFinite(request.amountSol) || request.amountSol <= 0) {
    throw new Error('Private payment amount must be greater than zero');
  }

  if (!request.recipient.trim()) {
    throw new Error('Private payment recipient is required');
  }

  const createdAt = Date.now();
  const amountLamports = amountSolToLamports(request.amountSol);
  const recipient = request.recipient.trim();
  const memo = request.memo?.trim();
  const nonce = `0x${randomHex(16)}`;
  const commitmentHex = `0x${stableHex([
    amountLamports,
    recipient,
    request.rail,
    request.settlement,
    request.proofLayer,
    request.durableReceipt ? 'durable' : 'ephemeral',
    memo ?? '',
    createdAt.toString(),
    nonce,
  ].join('|'))}`;

  return {
    ...request,
    recipient,
    memo,
    createdAt,
    status: 'queued',
    id: `pay_${createdAt.toString(36)}_${randomHex(4)}`,
    amountLamports,
    commitment: commitmentHex,
    commitmentHex,
    nonce,
  };
}

export function loadPrivatePaymentReceipts(): PrivatePaymentReceipt[] {
  if (!isBrowserStorageAvailable()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(PRIVATE_PAYMENT_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((receipt): receipt is PrivatePaymentReceipt => (
        receipt
        && typeof receipt.id === 'string'
        && typeof receipt.amountLamports === 'string'
        && typeof receipt.commitmentHex === 'string'
      ))
      .map((receipt): PrivatePaymentReceipt => {
        const status: PrivatePaymentStatus =
          receipt.status === 'anchored' || receipt.status === 'failed'
            ? receipt.status
            : 'queued';
        return { ...receipt, status };
      })
      .slice(0, MAX_PRIVATE_PAYMENT_RECEIPTS);
  } catch {
    return [];
  }
}

export function savePrivatePaymentReceipts(receipts: PrivatePaymentReceipt[]): void {
  if (!isBrowserStorageAvailable()) {
    return;
  }

  window.localStorage.setItem(
    PRIVATE_PAYMENT_STORAGE_KEY,
    JSON.stringify(receipts.slice(0, MAX_PRIVATE_PAYMENT_RECEIPTS)),
  );
}

export function appendPrivatePaymentReceipt(receipt: PrivatePaymentReceipt): PrivatePaymentReceipt[] {
  return updatePrivatePaymentReceipt(receipt);
}

export function updatePrivatePaymentReceipt(receipt: PrivatePaymentReceipt): PrivatePaymentReceipt[] {
  const next = [
    receipt,
    ...loadPrivatePaymentReceipts().filter((existing) => existing.id !== receipt.id),
  ].slice(0, MAX_PRIVATE_PAYMENT_RECEIPTS);
  savePrivatePaymentReceipts(next);
  return next;
}

export function createSolanaExplorerUrl(
  signature: string,
  cluster: 'devnet' | 'mainnet-beta',
): string {
  const clusterParam = cluster === 'devnet' ? '?cluster=devnet' : '';
  return `https://explorer.solana.com/tx/${signature}${clusterParam}`;
}

export function markPrivatePaymentAnchored(
  receipt: PrivatePaymentReceipt,
  params: {
    signature: string;
    cluster: 'devnet' | 'mainnet-beta';
    payer?: string;
    commitment?: 'processed' | 'confirmed' | 'finalized';
    anchoredAt?: number;
  },
): PrivatePaymentReceipt {
  const anchoredAt = params.anchoredAt ?? Date.now();
  return {
    ...receipt,
    status: 'anchored',
    updatedAt: anchoredAt,
    lastError: undefined,
    solanaAnchor: {
      signature: params.signature,
      cluster: params.cluster,
      explorerUrl: createSolanaExplorerUrl(params.signature, params.cluster),
      payer: params.payer,
      anchoredAt,
      commitment: params.commitment ?? 'confirmed',
    },
  };
}

export function markPrivatePaymentFailed(
  receipt: PrivatePaymentReceipt,
  error: string,
): PrivatePaymentReceipt {
  const updatedAt = Date.now();
  return {
    ...receipt,
    status: 'failed',
    updatedAt,
    lastError: error,
  };
}

export function markPrivatePaymentVerified(
  receipt: PrivatePaymentReceipt,
  verification: Omit<PrivatePaymentSolanaVerification, 'verifiedAt'> & { verifiedAt?: number },
): PrivatePaymentReceipt {
  const verifiedAt = verification.verifiedAt ?? Date.now();
  return {
    ...receipt,
    status: 'anchored',
    updatedAt: verifiedAt,
    lastError: undefined,
    solanaVerification: {
      ...verification,
      verifiedAt,
    },
  };
}

export function markPrivatePaymentVerificationFailed(
  receipt: PrivatePaymentReceipt,
  error: string,
): PrivatePaymentReceipt {
  const updatedAt = Date.now();
  return {
    ...receipt,
    status: receipt.solanaAnchor ? 'anchored' : 'failed',
    updatedAt,
    lastError: error,
  };
}

export function createPrivatePaymentEvmIntentProof(
  receipt: PrivatePaymentReceipt,
  options: {
    chainId?: number;
    verifyingContract?: string;
  } = {},
): PrivatePaymentEvmIntentProof {
  const memoHash = receipt.memo ? `0x${stableHex(receipt.memo, 16)}` : '0x';
  const eip712: PrivatePaymentEvmIntentProof['eip712'] = {
    domain: {
      name: 'ZOLana Dark Private Payment',
      version: '1',
      chainId: options.chainId ?? 1,
      verifyingContract: options.verifyingContract,
    },
    primaryType: 'PrivatePaymentIntent',
    types: {
      PrivatePaymentIntent: [
        { name: 'receiptId', type: 'string' },
        { name: 'rail', type: 'string' },
        { name: 'settlement', type: 'string' },
        { name: 'proofLayer', type: 'string' },
        { name: 'durableReceipt', type: 'bool' },
        { name: 'recipient', type: 'string' },
        { name: 'amountLamports', type: 'string' },
        { name: 'commitmentHex', type: 'bytes32' },
        { name: 'nonce', type: 'bytes16' },
        { name: 'memoHash', type: 'bytes16' },
        { name: 'solanaSignature', type: 'string' },
        { name: 'solanaCluster', type: 'string' },
        { name: 'createdAt', type: 'string' },
      ],
    },
    message: {
      receiptId: receipt.id,
      rail: receipt.rail,
      settlement: receipt.settlement,
      proofLayer: receipt.proofLayer,
      durableReceipt: receipt.durableReceipt,
      recipient: receipt.recipient,
      amountLamports: receipt.amountLamports,
      commitmentHex: receipt.commitmentHex,
      nonce: receipt.nonce,
      memoHash,
      solanaSignature: receipt.solanaAnchor?.signature ?? '',
      solanaCluster: receipt.solanaAnchor?.cluster ?? '',
      createdAt: receipt.createdAt.toString(),
    },
  };

  return {
    domain: 'zolana.dark.evm-intent',
    version: '1',
    digest: `0x${stableHex(JSON.stringify(eip712))}`,
    eip712,
  };
}

export function createPrivatePaymentProofPayload(
  receipt: PrivatePaymentReceipt,
  options: PrivatePaymentProofOptions = {},
): PrivatePaymentProofPayload {
  return {
    domain: 'zolana.dark.private-payment',
    version: '1',
    receiptId: receipt.id,
    rail: receipt.rail,
    settlement: receipt.settlement,
    proofLayer: receipt.proofLayer,
    durableReceipt: receipt.durableReceipt,
    recipient: receipt.recipient,
    amountLamports: receipt.amountLamports,
    commitmentHex: receipt.commitmentHex,
    nonce: receipt.nonce,
    createdAt: receipt.createdAt,
    status: receipt.status,
    solanaAnchor: receipt.solanaAnchor,
    solanaVerification: receipt.solanaVerification,
    memoHash: receipt.memo ? `0x${stableHex(receipt.memo, 16)}` : undefined,
    evmIntentProof: createPrivatePaymentEvmIntentProof(receipt, {
      chainId: options.evmChainId,
      verifyingContract: options.evmVerifyingContract,
    }),
  };
}

export function serializePrivatePaymentProofPayload(payload: PrivatePaymentProofPayload): string {
  return JSON.stringify(payload, null, 2);
}
