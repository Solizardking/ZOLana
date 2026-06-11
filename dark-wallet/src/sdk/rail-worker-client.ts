import {
  createPrivatePaymentProofPayload,
  verifyPrivatePaymentProofPayload,
  type PrivatePaymentProofOptions,
  type PrivatePaymentProofPayload,
  type PrivatePaymentReceipt,
} from './private-payment';
import {
  createRailAuthorizationEnvelope,
  verifyRailAuthorizationEnvelope,
  type RailAuthorizationEnvelope,
  type RailAuthorizationOptions,
} from './rail-authorization';

export interface RailWorkerLedgerAck {
  durable: boolean;
  recorded: boolean;
  authorizationId: string;
}

export interface RailWorkerSettlement {
  settled: boolean;
  status?: string;
  settlementId?: string;
  transactionId?: string;
  backendUrl?: string;
  evidence?: unknown;
  raw?: unknown;
  reason?: string;
}

export interface RailWorkerAuthorizeResult {
  ok: boolean;
  status: number;
  mode?: 'intent-only' | 'backend';
  rail?: string;
  authorizationId?: string;
  receiptId?: string;
  replayKey?: string;
  solanaSignature?: string;
  evmIntentDigest?: string;
  settlement?: RailWorkerSettlement;
  ledger?: RailWorkerLedgerAck;
  errors?: string[];
  workerUrl: string;
}

export interface RailWorkerLedgerEntry {
  version: 1;
  authorizationId: string;
  receiptId: string;
  rail: string;
  mode: 'intent-only' | 'backend';
  durableReceipt: boolean;
  recordedAt: number;
  expiresAt: number;
  responseStatus: number;
  settlementStatus?: string;
  settled: boolean;
  settlementId?: string;
  transactionId?: string;
  backendUrl?: string;
  evidenceDigest?: string;
  solanaAnchorSignature?: string;
  solanaCluster?: string;
  solanaVerifiedSlot?: number;
  evmIntentDigest: string;
  evmChainId: number;
  evmVerifyingContract?: string;
}

export interface RailWorkerSettlementResult {
  ok: boolean;
  status: number;
  settlement?: RailWorkerLedgerEntry;
  error?: string;
  workerUrl: string;
}

export interface SubmitRailAuthorizationOptions extends RailAuthorizationOptions {
  workerUrl: string;
  fetchImpl?: typeof fetch;
  requireSolanaAnchor?: boolean;
}

function normalizeWorkerUrl(workerUrl: string): string {
  const normalized = workerUrl.trim().replace(/\/+$/, '');
  if (!normalized) {
    throw new Error('RAIL_WORKER_URL is required to submit rail authorizations');
  }
  return normalized;
}

async function readJsonResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return {
      ok: false,
      errors: [`Rail worker returned non-JSON response: ${text.slice(0, 120)}`],
    };
  }
}

export function createRailWorkerRequest(
  receipt: PrivatePaymentReceipt,
  options: RailAuthorizationOptions = {},
): {
  proofPayload: PrivatePaymentProofPayload;
  railAuthorization: RailAuthorizationEnvelope;
} {
  const proofPayload = createPrivatePaymentProofPayload(receipt, {
    evmChainId: options.evmChainId,
    evmVerifyingContract: options.evmVerifyingContract,
  });
  const railAuthorization = createRailAuthorizationEnvelope(receipt, options);
  const proofVerification = verifyPrivatePaymentProofPayload(proofPayload, receipt, {
    evmChainId: options.evmChainId,
    evmVerifyingContract: options.evmVerifyingContract,
  });
  if (!proofVerification.ok) {
    throw new Error(`EVM proof payload mismatch: ${proofVerification.mismatches.join('; ')}`);
  }

  const railVerification = verifyRailAuthorizationEnvelope(railAuthorization, receipt, options);
  if (!railVerification.ok) {
    throw new Error(`Rail authorization mismatch: ${railVerification.mismatches.join('; ')}`);
  }

  return {
    proofPayload,
    railAuthorization,
  };
}

export async function submitRailAuthorizationToWorker(
  receipt: PrivatePaymentReceipt,
  options: SubmitRailAuthorizationOptions,
): Promise<RailWorkerAuthorizeResult> {
  if (options.requireSolanaAnchor !== false && !receipt.solanaAnchor?.signature) {
    throw new Error('Anchor the private-payment receipt on Solana before submitting it to the rail worker');
  }

  const workerUrl = normalizeWorkerUrl(options.workerUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const body = createRailWorkerRequest(receipt, options);
  const response = await fetchImpl(`${workerUrl}/rail/authorize`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = await readJsonResponse(response);

  return {
    ...payload,
    ok: Boolean(payload.ok) && response.ok,
    status: response.status,
    workerUrl,
    authorizationId: payload.authorizationId ?? body.railAuthorization.authorizationId,
    receiptId: payload.receiptId ?? receipt.id,
  };
}

export async function getRailWorkerSettlement(
  workerUrlValue: string,
  authorizationId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RailWorkerSettlementResult> {
  const workerUrl = normalizeWorkerUrl(workerUrlValue);
  const response = await fetchImpl(`${workerUrl}/rail/settlements/${encodeURIComponent(authorizationId)}`);
  const payload = await readJsonResponse(response);

  return {
    ok: Boolean(payload.ok) && response.ok,
    status: response.status,
    settlement: payload.settlement,
    error: payload.error,
    workerUrl,
  };
}

export async function listRailWorkerSettlements(
  workerUrlValue: string,
  limit = 20,
  fetchImpl: typeof fetch = fetch,
): Promise<{
  ok: boolean;
  status: number;
  settlements: RailWorkerLedgerEntry[];
  workerUrl: string;
}> {
  const workerUrl = normalizeWorkerUrl(workerUrlValue);
  const response = await fetchImpl(`${workerUrl}/rail/settlements?limit=${encodeURIComponent(String(limit))}`);
  const payload = await readJsonResponse(response);

  return {
    ok: Boolean(payload.ok) && response.ok,
    status: response.status,
    settlements: Array.isArray(payload.settlements) ? payload.settlements : [],
    workerUrl,
  };
}

export function railWorkerStatusFromAuthorizeResult(result: RailWorkerAuthorizeResult) {
  return {
    authorizationId: result.authorizationId ?? '',
    workerUrl: result.workerUrl,
    mode: result.mode,
    responseStatus: result.status,
    settlementStatus: result.settlement?.status,
    settled: result.settlement?.settled,
    settlementId: result.settlement?.settlementId,
    transactionId: result.settlement?.transactionId,
    ledgerDurable: result.ledger?.durable,
    ledgerRecorded: result.ledger?.recorded,
  };
}

export function railWorkerStatusFromLedgerEntry(workerUrl: string, entry: RailWorkerLedgerEntry) {
  return {
    authorizationId: entry.authorizationId,
    workerUrl,
    mode: entry.mode,
    responseStatus: entry.responseStatus,
    settlementStatus: entry.settlementStatus,
    settled: entry.settled,
    settlementId: entry.settlementId,
    transactionId: entry.transactionId,
    ledgerDurable: true,
    ledgerRecorded: true,
  };
}

export type RailWorkerProofOptions = PrivatePaymentProofOptions;
