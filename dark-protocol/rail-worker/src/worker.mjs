import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const VALID_RAILS = new Set(['x402', 'ap2', 'm2m']);
const KIND_BY_RAIL = {
  x402: 'x402-http-402',
  ap2: 'ap2-mandate',
  m2m: 'm2m-session',
};

export class ReplayStore {
  durable = false;
  #seen = new Map();
  #settlements = new Map();

  has(key, now = Date.now()) {
    this.#sweep(now);
    return this.#seen.has(key);
  }

  add(key, expiresAt, now = Date.now()) {
    this.#sweep(now);
    this.#seen.set(key, expiresAt);
  }

  consumeAndRecord(key, expiresAt, entry, now = Date.now()) {
    this.#sweep(now);
    this.#seen.set(key, expiresAt);
    if (entry?.authorizationId) {
      this.#settlements.set(entry.authorizationId, entry);
    }

    return {
      durable: this.durable,
      recorded: Boolean(entry?.authorizationId),
      authorizationId: entry?.authorizationId,
    };
  }

  getSettlement(authorizationId) {
    return this.#settlements.get(authorizationId);
  }

  listSettlements(limit = 50) {
    return Array.from(this.#settlements.values()).slice(-limit).reverse();
  }

  #sweep(now) {
    for (const [key, expiresAt] of this.#seen.entries()) {
      if (expiresAt <= now) this.#seen.delete(key);
    }
  }
}

function emptyLedger() {
  return {
    version: 1,
    replayKeys: {},
    settlements: [],
  };
}

function normalizeLedger(value) {
  const ledger = value && typeof value === 'object' ? value : {};
  return {
    version: 1,
    replayKeys: ledger.replayKeys && typeof ledger.replayKeys === 'object' ? ledger.replayKeys : {},
    settlements: Array.isArray(ledger.settlements) ? ledger.settlements : [],
  };
}

export class FileRailStore {
  durable = true;
  #data;

  constructor(filePath) {
    if (!filePath) {
      throw new Error('FileRailStore requires a ledger file path');
    }

    this.filePath = filePath;
    this.#data = this.#read();
    this.#persist();
  }

  has(key, now = Date.now()) {
    this.#data = this.#read();
    this.#sweep(now);
    const present = Object.prototype.hasOwnProperty.call(this.#data.replayKeys, key);
    this.#persist();
    return present;
  }

  add(key, expiresAt, now = Date.now()) {
    this.consumeAndRecord(key, expiresAt, undefined, now);
  }

  consumeAndRecord(key, expiresAt, entry, now = Date.now()) {
    this.#data = this.#read();
    this.#sweep(now);
    this.#data.replayKeys[key] = {
      expiresAt,
      consumedAt: now,
    };

    if (entry?.authorizationId) {
      this.#data.settlements = [
        ...this.#data.settlements.filter(item => item.authorizationId !== entry.authorizationId),
        entry,
      ];
    }

    this.#persist();
    return {
      durable: true,
      recorded: Boolean(entry?.authorizationId),
      authorizationId: entry?.authorizationId,
    };
  }

  getSettlement(authorizationId) {
    this.#data = this.#read();
    return this.#data.settlements.find(item => item.authorizationId === authorizationId);
  }

  listSettlements(limit = 50) {
    this.#data = this.#read();
    return this.#data.settlements.slice(-limit).reverse();
  }

  #read() {
    if (!fs.existsSync(this.filePath)) {
      return emptyLedger();
    }

    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) {
      return emptyLedger();
    }

    return normalizeLedger(JSON.parse(raw));
  }

  #persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(this.#data, null, 2)}\n`);
    fs.renameSync(tempPath, this.filePath);
  }

  #sweep(now) {
    for (const [key, value] of Object.entries(this.#data.replayKeys)) {
      if (value?.expiresAt <= now) {
        delete this.#data.replayKeys[key];
      }
    }
  }
}

export function createWorkerState(options = {}) {
  const storePath = options.storePath ?? options.env?.RAIL_WORKER_STORE_PATH;

  return {
    replayStore: storePath ? new FileRailStore(storePath) : new ReplayStore(),
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

export function stableHex(input, bytes = 32) {
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

  return Array.from(output, byte => byte.toString(16).padStart(2, '0')).join('');
}

function fallbackMemoHash(proof) {
  return proof.memoHash ?? (proof.memo ? `0x${stableHex(proof.memo, 16)}` : '0x');
}

function expectedAuthorizationId(auth) {
  const { authorizationId, ...withoutId } = auth;
  return `rail_${auth.rail}_${stableHex(JSON.stringify(withoutId), 16)}`;
}

function expectedReplayKey(proof, auth) {
  return `0x${stableHex([
    proof.receiptId,
    proof.nonce,
    proof.solanaAnchor?.signature ?? '',
    proof.evmIntentProof?.digest ?? '',
    String(auth.expiresAt),
  ].join('|'))}`;
}

function expectedM2MBindingDigest(proof) {
  return `0x${stableHex([
    proof.receiptId,
    proof.amountLamports,
    proof.commitmentHex,
    proof.evmIntentProof?.digest ?? '',
  ].join('|'))}`;
}

function validateEvmIntentProof(proof) {
  const errors = [];
  const evm = proof.evmIntentProof;
  const eip712 = evm?.eip712;
  const message = eip712?.message;

  if (evm?.domain !== 'zolana.dark.evm-intent') errors.push('invalid EVM intent proof domain');
  if (evm?.version !== '1') errors.push('invalid EVM intent proof version');
  if (!eip712 || typeof eip712 !== 'object') errors.push('evmIntentProof.eip712 is required');
  if (!message || typeof message !== 'object') errors.push('evmIntentProof.eip712.message is required');

  if (eip712) {
    const digest = `0x${stableHex(JSON.stringify(eip712))}`;
    if (evm?.digest !== digest) {
      errors.push(`evmIntentProof.digest: expected ${digest}, got ${String(evm?.digest)}`);
    }
  }

  if (message) {
    const checks = [
      ['evm.message.receiptId', message.receiptId, proof.receiptId],
      ['evm.message.rail', message.rail, proof.rail],
      ['evm.message.settlement', message.settlement, proof.settlement],
      ['evm.message.proofLayer', message.proofLayer, proof.proofLayer],
      ['evm.message.durableReceipt', message.durableReceipt, proof.durableReceipt],
      ['evm.message.recipient', message.recipient, proof.recipient],
      ['evm.message.amountLamports', message.amountLamports, proof.amountLamports],
      ['evm.message.commitmentHex', message.commitmentHex, proof.commitmentHex],
      ['evm.message.nonce', message.nonce, proof.nonce],
      ['evm.message.memoHash', message.memoHash, fallbackMemoHash(proof)],
      ['evm.message.solanaSignature', message.solanaSignature, proof.solanaAnchor?.signature ?? ''],
      ['evm.message.solanaCluster', message.solanaCluster, proof.solanaAnchor?.cluster ?? ''],
      ['evm.message.createdAt', message.createdAt, String(proof.createdAt)],
    ];

    for (const [field, actual, expected] of checks) {
      if (actual !== expected) {
        errors.push(`${field}: expected ${String(expected)}, got ${String(actual)}`);
      }
    }
  }

  return errors;
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
  if (auth.authorizationId !== expectedAuthorizationId(auth)) errors.push('authorizationId mismatch');
  if (auth.replayKey !== expectedReplayKey(proof, auth)) errors.push('replayKey mismatch');

  errors.push(...validateEvmIntentProof(proof));

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
    if (auth.x402?.payTo !== proof.recipient) errors.push('x402 payTo mismatch');
    if (auth.x402?.maxAmountLamports !== proof.amountLamports) errors.push('x402 amount mismatch');
  }

  if (auth.rail === 'ap2') {
    if (!auth.ap2?.constraints?.requireSolanaMemoVerification) errors.push('ap2 requires Solana Memo verification');
    if (!auth.ap2?.constraints?.requireEvmIntentProof) errors.push('ap2 requires EVM intent proof');
    if (auth.ap2?.constraints?.maxAmountLamports !== proof.amountLamports) errors.push('ap2 amount mismatch');
    if (auth.ap2?.constraints?.recipient !== proof.recipient) errors.push('ap2 recipient mismatch');
    if (auth.ap2?.constraints?.nonce !== proof.nonce) errors.push('ap2 nonce mismatch');
    if (auth.ap2?.constraints?.expiresAt !== auth.expiresAt) errors.push('ap2 expiry mismatch');
  }

  if (auth.rail === 'm2m') {
    if (auth.m2m?.replayKey !== auth.replayKey) errors.push('m2m replay key mismatch');
    const bindingDigest = expectedM2MBindingDigest(proof);
    if (auth.m2m?.bindingDigest !== bindingDigest) {
      errors.push(`m2m binding digest mismatch: expected ${bindingDigest}, got ${String(auth.m2m?.bindingDigest)}`);
    }
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

function settlementLedgerEntry(auth, result, now) {
  const settlement = result.settlement ?? {};
  const evidenceDigest = settlement.evidence
    ? stableDigest(JSON.stringify(settlement.evidence))
    : undefined;

  return {
    version: 1,
    authorizationId: auth.authorizationId,
    receiptId: auth.receiptId,
    rail: auth.rail,
    mode: result.mode,
    durableReceipt: auth.durableReceipt,
    recordedAt: now,
    expiresAt: auth.expiresAt,
    responseStatus: result.status,
    settlementStatus: settlement.status ?? (settlement.settled ? 'settled' : 'pending'),
    settled: Boolean(settlement.settled),
    settlementId: settlement.settlementId,
    transactionId: settlement.transactionId,
    backendUrl: settlement.backendUrl,
    evidenceDigest,
    solanaAnchorSignature: auth.solanaAnchorSignature,
    solanaCluster: auth.solanaCluster,
    solanaVerifiedSlot: auth.solanaVerifiedSlot,
    evmIntentDigest: auth.evmIntentDigest,
    evmChainId: auth.evmChainId,
    evmVerifyingContract: auth.evmVerifyingContract,
  };
}

function consumeReplayAndRecord(state, auth, result, now) {
  const entry = settlementLedgerEntry(auth, result, now);
  const store = state.replayStore;

  if (typeof store?.consumeAndRecord === 'function') {
    return store.consumeAndRecord(auth.replayKey, auth.expiresAt, entry, now);
  }

  store.add(auth.replayKey, auth.expiresAt, now);
  return {
    durable: Boolean(store?.durable),
    recorded: false,
    authorizationId: auth.authorizationId,
  };
}

export function listRailSettlements(state, limit = 50) {
  return state.replayStore?.listSettlements?.(limit) ?? [];
}

export function getRailSettlement(state, authorizationId) {
  return state.replayStore?.getSettlement?.(authorizationId);
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

  if (backend.skipped) {
    const result = intentOnlyResult(auth, proof);
    result.ledger = consumeReplayAndRecord(state, auth, result, now);
    return result;
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
  result.ledger = consumeReplayAndRecord(state, auth, result, now);

  return result;
}

export function responseBody(result) {
  return JSON.stringify(result, null, 2);
}
