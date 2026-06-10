import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Buffer } from 'buffer';
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
