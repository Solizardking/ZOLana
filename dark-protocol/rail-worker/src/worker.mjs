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

export function processRailRequest(body, state = createWorkerState(), options = {}) {
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

  state.replayStore.add(auth.replayKey, auth.expiresAt, now);

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
      reason: 'No live x402 facilitator, AP2 mandate runner, or M2M settlement backend configured',
    },
    headers: auth.rail === 'x402' ? {
      'PAYMENT-REQUIRED': Buffer.from(JSON.stringify({
        scheme: auth.x402.scheme,
        resource: auth.x402.resource,
        maxAmountLamports: auth.x402.maxAmountLamports,
        payTo: auth.x402.payTo,
        receiptId: proof.receiptId,
      })).toString('base64url'),
      'PAYMENT-SIGNATURE': auth.authorizationId,
    } : undefined,
  };
}

export function responseBody(result) {
  return JSON.stringify(result, null, 2);
}
