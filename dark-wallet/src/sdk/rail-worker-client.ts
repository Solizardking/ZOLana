import {
  createPrivatePaymentProofPayload,
  verifyPrivatePaymentProofPayload,
  type PrivatePaymentEvmVerifierPlan,
  type PrivatePaymentProofOptions,
  type PrivatePaymentProofPayload,
  type PrivatePaymentRail,
  type PrivatePaymentReceipt,
} from './private-payment';
import {
  createRailAuthorizationEnvelope,
  verifyRailAuthorizationEnvelope,
  type RailAuthorizationEnvelope,
  type RailAuthorizationOptions,
} from './rail-authorization';
import type { DarkClawdRailPlan, DarkClawdRailPlanContext } from '../utils/dark-clawd-agent';

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
  evmVerifierPlan?: PrivatePaymentEvmVerifierPlan;
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
  evmVerifierRequired?: boolean;
  evmVerifierReady?: boolean;
  evmVerifierStatus?: string;
  evmVerifierPlanDigest?: string;
  evmVerifierSolanaSlot?: number;
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

export interface RailWorkerAgentPlanResult {
  ok: boolean;
  status: number;
  mode?: 'local' | 'xai';
  service?: string;
  agent?: {
    available: boolean;
    model?: string;
    baseUrl?: string;
    skipped?: boolean;
    error?: string;
  };
  context?: DarkClawdRailPlanContext;
  plan?: DarkClawdRailPlan;
  modelReview?: string;
  promptDigest?: string;
  promptVersion?: number;
  error?: string;
  errors?: string[];
  workerUrl: string;
}

export interface RailWorkerPreflightRail {
  rail: string;
  configured: boolean;
  status: string;
  endpoint?: string;
  endpointDigest?: string;
  authConfigured?: boolean;
  probe?: string;
  responseStatus?: number;
  reason?: string;
  error?: string;
}

export interface RailWorkerPreflightResult {
  ok: boolean;
  status: number;
  service?: string;
  generatedAt?: string;
  mode?: 'blocked' | 'intent-only' | 'partial-live' | 'live-ready' | string;
  ready?: boolean;
  liveSettlementReady?: boolean;
  allRailsConfigured?: boolean;
  blockers?: string[];
  warnings?: string[];
  solana?: {
    cluster?: string;
    verificationEnabled?: boolean;
    verificationRequired?: boolean;
    commitment?: string;
    rpcConfigured?: boolean;
    rpcEndpoint?: string;
    rpcEndpointDigest?: string;
    status?: string;
  };
  evm?: {
    chainId?: number;
    verifierConfigured?: boolean;
    verifier?: string;
    status?: string;
  };
  xai?: {
    configured?: boolean;
    model?: string;
    baseUrl?: string;
    status?: string;
  };
  replayLedger?: {
    durable?: boolean;
    status?: string;
  };
  rails?: Partial<Record<PrivatePaymentRail, RailWorkerPreflightRail>>;
  error?: string;
  errors?: string[];
  workerUrl: string;
}

export interface RailWorkerPreflightOptions {
  probe?: boolean;
  fetchImpl?: typeof fetch;
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

export async function planRailWithWorker(
  workerUrlValue: string,
  context: DarkClawdRailPlanContext,
  fetchImpl: typeof fetch = fetch,
): Promise<RailWorkerAgentPlanResult> {
  const workerUrl = normalizeWorkerUrl(workerUrlValue);
  const publicContext = { ...context };
  delete publicContext.operatorPrompt;
  const response = await fetchImpl(`${workerUrl}/agent/rail-plan`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ context: publicContext }),
  });
  const payload = await readJsonResponse(response);

  return {
    ...payload,
    ok: Boolean(payload.ok) && response.ok,
    status: response.status,
    workerUrl,
  };
}

export async function getRailWorkerPreflight(
  workerUrlValue: string,
  options: RailWorkerPreflightOptions = {},
): Promise<RailWorkerPreflightResult> {
  const workerUrl = normalizeWorkerUrl(workerUrlValue);
  const fetchImpl = options.fetchImpl ?? fetch;
  const query = options.probe ? '?probe=1' : '';
  const response = await fetchImpl(`${workerUrl}/rail/preflight${query}`);
  const payload = await readJsonResponse(response);

  return {
    ...payload,
    ok: Boolean(payload.ok) && response.ok,
    status: response.status,
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
    evmVerifierPlan: normalizeEvmVerifierPlan(result.evmVerifierPlan),
  };
}

export function railWorkerStatusFromLedgerEntry(workerUrl: string, entry: RailWorkerLedgerEntry) {
  const hasEvmVerifierPlan = typeof entry.evmVerifierRequired === 'boolean'
    || typeof entry.evmVerifierReady === 'boolean'
    || typeof entry.evmVerifierStatus === 'string'
    || typeof entry.evmVerifierPlanDigest === 'string';

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
    evmVerifierPlan: hasEvmVerifierPlan ? normalizeEvmVerifierPlan({
      required: entry.evmVerifierRequired,
      ready: entry.evmVerifierReady,
      status: entry.evmVerifierStatus,
      receiptId: entry.receiptId,
      rail: entry.rail,
      verifier: entry.evmVerifyingContract,
      chainId: entry.evmChainId,
      digest: entry.evmIntentDigest,
      solanaSlot: entry.evmVerifierSolanaSlot ?? entry.solanaVerifiedSlot,
      solanaSignature: entry.solanaAnchorSignature,
      solanaCluster: entry.solanaCluster,
      planDigest: entry.evmVerifierPlanDigest,
    }) : undefined,
  };
}

export type RailWorkerProofOptions = PrivatePaymentProofOptions;

function normalizeEvmVerifierPlan(plan?: PrivatePaymentEvmVerifierPlan): PrivatePaymentEvmVerifierPlan | undefined {
  if (!plan || typeof plan !== 'object') {
    return undefined;
  }

  const problems = Array.isArray(plan.problems)
    ? plan.problems.filter((problem): problem is string => typeof problem === 'string')
    : undefined;

  return {
    required: typeof plan.required === 'boolean' ? plan.required : undefined,
    ready: typeof plan.ready === 'boolean' ? plan.ready : undefined,
    status: typeof plan.status === 'string' ? plan.status : undefined,
    receiptId: typeof plan.receiptId === 'string' ? plan.receiptId : undefined,
    rail: typeof plan.rail === 'string' ? plan.rail : undefined,
    verifier: typeof plan.verifier === 'string' ? plan.verifier : undefined,
    chainId: typeof plan.chainId === 'number' ? plan.chainId : undefined,
    digest: typeof plan.digest === 'string' ? plan.digest : undefined,
    solanaSlot: typeof plan.solanaSlot === 'number' ? plan.solanaSlot : undefined,
    solanaSignature: typeof plan.solanaSignature === 'string' ? plan.solanaSignature : undefined,
    solanaCluster: typeof plan.solanaCluster === 'string' ? plan.solanaCluster : undefined,
    proofPayloadRequired: typeof plan.proofPayloadRequired === 'boolean' ? plan.proofPayloadRequired : undefined,
    signCommand: typeof plan.signCommand === 'string' ? plan.signCommand : undefined,
    submitCommand: typeof plan.submitCommand === 'string' ? plan.submitCommand : undefined,
    problems,
    planDigest: typeof plan.planDigest === 'string' ? plan.planDigest : undefined,
  };
}
