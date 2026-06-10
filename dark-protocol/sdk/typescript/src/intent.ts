import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import bs58 from 'bs58';
import type { PrivatePaymentReceipt } from './private-payment';

export const DARK_MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export type DarkIntentAction = 'shield' | 'unshield' | 'private_transfer' | 'private_payment';

export interface DarkIntentPayload {
  protocol: 'zolana.dark';
  version: 1;
  action: DarkIntentAction;
  payer: string;
  amountLamports: string;
  commitment: string;
  createdAt: number;
  memoHash?: string;
  recipient?: string;
  shieldedAddress?: string;
  rail?: 'x402' | 'ap2' | 'm2m';
  settlement?: 'solana' | 'evm';
  proofLayer?: 'solana' | 'evm';
  durableReceipt?: boolean;
  receiptId?: string;
}

export interface BuildDarkIntentParams {
  payer: PublicKey;
  payload: DarkIntentPayload;
}

export interface DarkIntentPayloadVerification {
  ok: boolean;
  mismatches: string[];
}

export interface DarkIntentVerificationResult extends DarkIntentPayloadVerification {
  signature: string;
  slot?: number;
  blockTime?: number | null;
  payer?: string;
  payload?: DarkIntentPayload;
  reason?: string;
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

export function createDarkIntentCommitment(action: DarkIntentAction, fields: string[]): string {
  return `0x${stableHex([action, ...fields, Date.now().toString()].join('|'))}`;
}

export function createDarkMemoHash(memo?: string): string | undefined {
  const trimmed = memo?.trim();
  return trimmed ? `0x${stableHex(trimmed, 16)}` : undefined;
}

export function decodeDarkIntentMemo(raw: string): DarkIntentPayload | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed
      && parsed.protocol === 'zolana.dark'
      && parsed.version === 1
      && typeof parsed.action === 'string'
    ) {
      return parsed as DarkIntentPayload;
    }
  } catch {
    return null;
  }

  return null;
}

export function readDarkMemoInstructionText(instruction: any): string | null {
  const programId = instruction?.programId?.toBase58?.() ?? instruction?.programId?.toString?.();
  if (programId !== DARK_MEMO_PROGRAM_ID.toBase58()) {
    return null;
  }

  if (typeof instruction.parsed === 'string') {
    return instruction.parsed;
  }

  if (typeof instruction.parsed?.memo === 'string') {
    return instruction.parsed.memo;
  }

  if (typeof instruction.data === 'string') {
    try {
      return Buffer.from(bs58.decode(instruction.data)).toString('utf8');
    } catch {
      return null;
    }
  }

  return null;
}

export function comparePrivatePaymentIntentPayload(
  payload: DarkIntentPayload,
  receipt: PrivatePaymentReceipt,
  expectedPayer?: string,
): string[] {
  const expectedMemoHash = createDarkMemoHash(receipt.memo);
  const checks: Array<[string, unknown, unknown]> = [
    ['protocol', payload.protocol, 'zolana.dark'],
    ['version', payload.version, 1],
    ['action', payload.action, 'private_payment'],
    ['receiptId', payload.receiptId, receipt.id],
    ['recipient', payload.recipient, receipt.recipient],
    ['amountLamports', payload.amountLamports, receipt.amountLamports.toString()],
    ['commitment', payload.commitment, receipt.commitmentHex],
    ['rail', payload.rail, receipt.rail],
    ['settlement', payload.settlement, receipt.settlement],
    ['proofLayer', payload.proofLayer, receipt.proofLayer],
    ['durableReceipt', payload.durableReceipt, receipt.durableReceipt],
  ];

  if (expectedPayer) {
    checks.push(['payer', payload.payer, expectedPayer]);
  }

  if (expectedMemoHash) {
    checks.push(['memoHash', payload.memoHash, expectedMemoHash]);
  }

  return checks
    .filter(([, actual, expected]) => actual !== expected)
    .map(([field, actual, expected]) => `${field}: expected ${String(expected)}, got ${String(actual)}`);
}

export function verifyPrivatePaymentIntentPayload(
  payload: DarkIntentPayload,
  receipt: PrivatePaymentReceipt,
  expectedPayer?: string,
): DarkIntentPayloadVerification {
  const mismatches = comparePrivatePaymentIntentPayload(payload, receipt, expectedPayer);
  return {
    ok: mismatches.length === 0,
    mismatches,
  };
}

export function solToLamportsString(amountSol: number): string {
  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    throw new Error('Amount must be greater than zero');
  }

  return BigInt(Math.round(amountSol * 1_000_000_000)).toString();
}

export function buildDarkIntentTransaction(params: BuildDarkIntentParams): Transaction {
  const transaction = new Transaction().add(new TransactionInstruction({
    programId: DARK_MEMO_PROGRAM_ID,
    keys: [{ pubkey: params.payer, isSigner: true, isWritable: false }],
    data: Buffer.from(JSON.stringify(params.payload), 'utf8'),
  }));
  transaction.feePayer = params.payer;
  return transaction;
}

export function createPrivatePaymentIntentPayload(
  payer: PublicKey,
  receipt: PrivatePaymentReceipt,
): DarkIntentPayload {
  return {
    protocol: 'zolana.dark',
    version: 1,
    action: 'private_payment',
    payer: payer.toBase58(),
    recipient: receipt.recipient,
    amountLamports: receipt.amountLamports.toString(),
    commitment: receipt.commitmentHex,
    createdAt: receipt.createdAt,
    memoHash: createDarkMemoHash(receipt.memo),
    rail: receipt.rail,
    settlement: receipt.settlement,
    proofLayer: receipt.proofLayer,
    durableReceipt: receipt.durableReceipt,
    receiptId: receipt.id,
  };
}
