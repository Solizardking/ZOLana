export type PrivatePaymentRail = 'x402' | 'ap2' | 'm2m';
export type PrivatePaymentSettlement = 'solana' | 'evm';
export type PrivatePaymentProofLayer = 'solana' | 'evm';

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
  status: 'queued';
  commitment: string;
}

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

export function stagePrivatePayment(request: PrivatePaymentRequest): PrivatePaymentReceipt {
  if (!Number.isFinite(request.amountSol) || request.amountSol <= 0) {
    throw new Error('Private payment amount must be greater than zero');
  }

  if (!request.recipient.trim()) {
    throw new Error('Private payment recipient is required');
  }

  const createdAt = Date.now();
  return {
    ...request,
    recipient: request.recipient.trim(),
    memo: request.memo?.trim(),
    createdAt,
    status: 'queued',
    id: `pay_${createdAt.toString(36)}_${randomHex(4)}`,
    commitment: `0x${randomHex(32)}`,
  };
}
