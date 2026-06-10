export type PrivatePaymentRail = 'x402' | 'ap2' | 'm2m';
export type PrivatePaymentSettlement = 'solana' | 'evm';
export type PrivatePaymentProofLayer = 'solana' | 'evm';

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
  status: 'queued';
  commitment: Uint8Array;
  commitmentHex: string;
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
  const commitment = stableBytes([
    request.amountLamports.toString(),
    recipient,
    request.rail,
    request.settlement,
    request.proofLayer,
    request.durableReceipt ? 'durable' : 'ephemeral',
    request.memo ?? '',
    createdAt.toString(),
    bytesToHex(entropy),
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
  ].join(' | ');
}
