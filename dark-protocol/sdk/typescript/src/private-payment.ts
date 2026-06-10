export type PrivatePaymentRail = 'x402' | 'ap2' | 'm2m';
export type PrivatePaymentSettlement = 'solana' | 'evm';
export type PrivatePaymentProofLayer = 'solana' | 'evm';
export type PrivatePaymentStatus = 'queued' | 'anchored' | 'failed';

export interface PrivatePaymentRequest {
  amountLamports: bigint;
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
  commitment: Uint8Array;
  commitmentHex: string;
  nonce: string;
  solanaAnchor?: PrivatePaymentSolanaAnchor;
  lastError?: string;
}

export interface PrivatePaymentSolanaAnchor {
  signature: string;
  cluster: 'devnet' | 'mainnet-beta';
  explorerUrl: string;
  anchoredAt: number;
  commitment: 'processed' | 'confirmed' | 'finalized';
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
  memoHash?: string;
  evmIntentProof: PrivatePaymentEvmIntentProof;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function stableBytes(input: string): Uint8Array {
  const encoded = new TextEncoder().encode(input);
  const out = new Uint8Array(32);
  for (let index = 0; index < encoded.length; index += 1) {
    out[index % out.length] ^= encoded[index];
    out[(index * 7) % out.length] = (out[(index * 7) % out.length] + encoded[index]) & 0xff;
  }
  return out;
}

function stableHex(input: string, bytes = 32): string {
  const output = stableBytes(input);
  return bytesToHex(output.slice(0, bytes));
}

export function createPrivatePaymentReceipt(request: PrivatePaymentRequest): PrivatePaymentReceipt {
  if (request.amountLamports <= 0n) {
    throw new Error('Private payment amount must be greater than zero');
  }

  const recipient = request.recipient.trim();
  if (!recipient) {
    throw new Error('Private payment recipient is required');
  }

  const createdAt = Date.now();
  const entropy = randomBytes(16);
  const nonce = `0x${bytesToHex(entropy)}`;
  const commitment = stableBytes([
    request.amountLamports.toString(),
    recipient,
    request.rail,
    request.settlement,
    request.proofLayer,
    request.durableReceipt ? 'durable' : 'ephemeral',
    request.memo ?? '',
    createdAt.toString(),
    nonce,
  ].join('|'));

  return {
    ...request,
    recipient,
    memo: request.memo?.trim(),
    createdAt,
    status: 'queued',
    id: `darkpay_${createdAt.toString(36)}_${bytesToHex(entropy).slice(0, 8)}`,
    commitment,
    commitmentHex: `0x${bytesToHex(commitment)}`,
    nonce,
  };
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
      amountLamports: receipt.amountLamports.toString(),
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

export function createPrivatePaymentProofPayload(receipt: PrivatePaymentReceipt): PrivatePaymentProofPayload {
  return {
    domain: 'zolana.dark.private-payment',
    version: '1',
    receiptId: receipt.id,
    rail: receipt.rail,
    settlement: receipt.settlement,
    proofLayer: receipt.proofLayer,
    durableReceipt: receipt.durableReceipt,
    recipient: receipt.recipient,
    amountLamports: receipt.amountLamports.toString(),
    commitmentHex: receipt.commitmentHex,
    nonce: receipt.nonce,
    createdAt: receipt.createdAt,
    status: receipt.status,
    solanaAnchor: receipt.solanaAnchor,
    memoHash: receipt.memo ? `0x${stableHex(receipt.memo, 16)}` : undefined,
    evmIntentProof: createPrivatePaymentEvmIntentProof(receipt),
  };
}

export function describePrivatePaymentReceipt(receipt: PrivatePaymentReceipt): string {
  const durability = receipt.durableReceipt ? 'durable' : 'ephemeral';
  return [
    `${receipt.rail.toUpperCase()} private payment`,
    `${receipt.amountLamports.toString()} lamports`,
    `${receipt.settlement.toUpperCase()} settlement`,
    `${receipt.proofLayer.toUpperCase()} proof layer`,
    durability,
    receipt.status.toUpperCase(),
  ].join(' | ');
}
