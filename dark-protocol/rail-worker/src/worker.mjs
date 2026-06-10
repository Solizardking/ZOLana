import { createHash } from 'node:crypto';

const VALID_RAILS = new Set(['x402', 'ap2', 'm2m']);
const KIND_BY_RAIL = {
  x402: 'x402-http-402',
  ap2: 'ap2-mandate',
  m2m: 'm2m-session',
};

export class ReplayStore {
  #seen = new Map();

  has(key, now = Date.now()) {
    this.#sweep(now);
    return this.#seen.has(key);
  }

  add(key, expiresAt, now = Date.now()) {
    this.#sweep(now);
    this.#seen.set(key, expiresAt);
  }

  #sweep(now) {
    for (const [key, expiresAt] of this.#seen.entries()) {
      if (expiresAt <= now) this.#seen.delete(key);
    }
  }
}

export function createWorkerState() {
  return {
    replayStore: new ReplayStore(),
  };
}

export function createSettlementConfig(env = process.env) {
  return {
    backendToken: env.RAIL_WORKER_BACKEND_TOKEN ?? '',
    backendUrls: {
      x402: env.X402_FACILITATOR_URL ?? '',
      ap2: env.AP2_MANDATE_RUNNER_URL ?? '',
      m2m: env.M2M_SETTLEMENT_URL ?? '',
    },
  };
}

export function stableDigest(value) {
  return `0x${createHash('sha256').update(value).digest('hex')}`;
}

export function validateRailRequest(body, options = {}) {
  const now = options.now ?? Date.now();
  const proof = body?.proofPayload;
  const auth = body?.railAuthorization;
  const errors = [];

  if (!proof || typeof proof !== 'object') {
    errors.push('proofPayload is required');
  }
  if (!auth || typeof auth !== 'object') {
    errors.push('railAuthorization is required');
  }
  if (errors.length > 0) return { ok: false, errors };

  if (proof.domain !== 'zolana.dark.private-payment') errors.push('invalid proof domain');
  if (auth.domain !== 'zolana.dark.rail-authorization') errors.push('invalid rail authorization domain');
  if (!VALID_RAILS.has(auth.rail)) errors.push(`unsupported rail ${auth.rail}`);
  if (auth.kind !== KIND_BY_RAIL[auth.rail]) errors.push('rail kind mismatch');
  if (!auth.durableReceipt) errors.push('rail authorization must be durable');
  if (!auth.replayKey) errors.push('replayKey is required');
  if (auth.expiresAt <= now) errors.push('rail authorization is expired');

  const checks = [
    ['receiptId', auth.receiptId, proof.receiptId],
    ['rail', auth.rail, proof.rail],
    ['recipient', auth.recipient, proof.recipient],
    ['amountLamports', auth.amountLamports, proof.amountLamports],
    ['commitmentHex', auth.commitmentHex, proof.commitmentHex],
    ['solanaAnchorSignature', auth.solanaAnchorSignature, proof.solanaAnchor?.signature],
    ['solanaCluster', auth.solanaCluster, proof.solanaAnchor?.cluster],
    ['evmIntentDigest', auth.evmIntentDigest, proof.evmIntentProof?.digest],
    ['evmChainId', auth.evmChainId, proof.evmIntentProof?.eip712?.domain?.chainId],
    ['evmVerifyingContract', auth.evmVerifyingContract, proof.evmIntentProof?.eip712?.domain?.verifyingContract],
  ];

  for (const [field, actual, expected] of checks) {
    if (actual !== expected) {
      errors.push(`${field}: expected ${String(expected)}, got ${String(actual)}`);
    }
  }

  if (proof.solanaVerification && auth.solanaVerifiedSlot !== proof.solanaVerification.slot) {
    errors.push('solanaVerifiedSlot mismatch');
  }

  if (auth.rail === 'x402') {
    if (auth.x402?.statusCode !== 402) errors.push('x402 statusCode must be 402');
    if (auth.x402?.paymentRequiredHeader !== 'PAYMENT-REQUIRED') errors.push('x402 payment required header mismatch');
    if (auth.x402?.paymentSignatureHeader !== 'PAYMENT-SIGNATURE') errors.push('x402 payment signature header mismatch');
  }

  if (auth.rail === 'ap2') {
    if (!auth.ap2?.constraints?.requireSolanaMemoVerification) errors.push('ap2 requires Solana Memo verification');
    if (!auth.ap2?.constraints?.requireEvmIntentProof) errors.push('ap2 requires EVM intent proof');
  }

  if (auth.rail === 'm2m') {
    if (auth.m2m?.replayKey !== auth.replayKey) errors.push('m2m replay key mismatch');
    if (!auth.m2m?.bindingDigest) errors.push('m2m binding digest is required');
  }

  return {
    ok: errors.length === 0,
    errors,
    proof,
    auth,
  };
}

function x402Headers(auth, proof) {
  if (auth.rail !== 'x402') return undefined;

  return {
    'PAYMENT-REQUIRED': Buffer.from(JSON.stringify({
      scheme: auth.x402.scheme,
      resource: auth.x402.resource,
      maxAmountLamports: auth.x402.maxAmountLamports,
      payTo: auth.x402.payTo,
      receiptId: proof.receiptId,
    })).toString('base64url'),
    'PAYMENT-SIGNATURE': auth.authorizationId,
  };
}

function intentOnlyResult(auth, proof) {
  return {
    ok: true,
    status: auth.rail === 'x402' ? 202 : 200,
    mode: 'intent-only',
    rail: auth.rail,
    authorizationId: auth.authorizationId,
    receiptId: auth.receiptId,
    replayKey: auth.replayKey,
    solanaSignature: auth.solanaAnchorSignature,
    evmIntentDigest: auth.evmIntentDigest,
    settlement: {
      settled: false,
      status: 'intent-only',
      reason: 'No live x402 facilitator, AP2 mandate runner, or M2M settlement backend configured',
    },
    headers: x402Headers(auth, proof),
  };
}

function normalizeBackendPayload(payload = {}) {
  const status = payload.settlementStatus ?? payload.status ?? (payload.settled === true ? 'settled' : 'pending');
  const settled = payload.settled === true || status === 'settled';

  return {
    settled,
    status,
    settlementId: payload.settlementId ?? payload.id,
    transactionId: payload.transactionId ?? payload.signature ?? payload.txid,
    evidence: payload.evidence,
    raw: payload,
  };
}

async function readBackendPayload(response) {
  if (response.status === 204) return {};

  try {
    return await response.json();
  } catch {
    try {
      const text = await response.text();
      return text ? { rawText: text } : {};
    } catch {
      return {};
    }
  }
}

export async function callSettlementBackend(auth, proof, config, fetchImpl = globalThis.fetch) {
  const backendUrl = config.backendUrls?.[auth.rail] ?? '';
  if (!backendUrl) {
    return { ok: true, skipped: true };
  }

  if (typeof fetchImpl !== 'function') {
    return {
      ok: false,
      status: 502,
      errors: [`${auth.rail} settlement backend is configured but fetch is unavailable`],
    };
  }

  const headers = {
    'content-type': 'application/json',
  };
  if (config.backendToken) {
    headers.authorization = `Bearer ${config.backendToken}`;
  }

  let response;
  try {
    response = await fetchImpl(backendUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        version: '1',
        rail: auth.rail,
        proofPayload: proof,
        railAuthorization: auth,
        localVerification: {
          authorizationId: auth.authorizationId,
          receiptId: auth.receiptId,
          replayKey: auth.replayKey,
          solanaAnchorSignature: auth.solanaAnchorSignature,
          solanaCluster: auth.solanaCluster,
          solanaVerifiedSlot: auth.solanaVerifiedSlot,
          evmIntentDigest: auth.evmIntentDigest,
          evmChainId: auth.evmChainId,
          evmVerifyingContract: auth.evmVerifyingContract,
        },
      }),
    });
  } catch (error) {
    return {
      ok: false,
      status: 502,
      errors: [`${auth.rail} settlement backend request failed: ${error.message}`],
    };
  }

  const payload = await readBackendPayload(response);
  if (!response.ok || payload.ok === false) {
    return {
      ok: false,
      status: 502,
      backendStatus: response.status,
      errors: [payload.error ?? payload.message ?? `${auth.rail} settlement backend rejected the authorization`],
      settlement: {
        settled: false,
        status: 'backend-rejected',
        backendUrl,
        raw: payload,
      },
    };
  }

  return {
    ok: true,
    skipped: false,
    backendStatus: response.status,
    backendUrl,
    settlement: {
      backendUrl,
      ...normalizeBackendPayload(payload),
    },
  };
}

export async function processRailRequest(body, state = createWorkerState(), options = {}) {
  const now = options.now ?? Date.now();
  const validation = validateRailRequest(body, options);
  if (!validation.ok) {
    return {
      ok: false,
      status: 400,
      errors: validation.errors,
    };
  }

  const { auth, proof } = validation;
  if (state.replayStore.has(auth.replayKey, now)) {
    return {
      ok: false,
      status: 409,
      errors: [`replay key already consumed: ${auth.replayKey}`],
    };
  }

  const settlementConfig = options.settlementConfig ?? createSettlementConfig(options.env ?? process.env);
  const backendUrls = {
    ...settlementConfig.backendUrls,
    ...(options.backendUrls ?? {}),
  };
  const backendToken = options.backendToken ?? settlementConfig.backendToken;
  const backend = await callSettlementBackend(
    auth,
    proof,
    { backendUrls, backendToken },
    options.fetch ?? globalThis.fetch,
  );

  if (!backend.ok) {
    return {
      ok: false,
      status: 502,
      rail: auth.rail,
      authorizationId: auth.authorizationId,
      receiptId: auth.receiptId,
      replayKey: auth.replayKey,
      backendStatus: backend.backendStatus,
      errors: backend.errors,
      settlement: backend.settlement ?? {
        settled: false,
        status: 'backend-error',
      },
    };
  }

  state.replayStore.add(auth.replayKey, auth.expiresAt, now);

  if (backend.skipped) {
    return intentOnlyResult(auth, proof);
  }

  const result = {
    ok: true,
    status: backend.settlement.settled ? 200 : 202,
    mode: 'backend',
    rail: auth.rail,
    authorizationId: auth.authorizationId,
    receiptId: auth.receiptId,
    replayKey: auth.replayKey,
    solanaSignature: auth.solanaAnchorSignature,
    evmIntentDigest: auth.evmIntentDigest,
    settlement: backend.settlement,
    headers: x402Headers(auth, proof),
  };

  return result;
}

export function responseBody(result) {
  return JSON.stringify(result, null, 2);
}
