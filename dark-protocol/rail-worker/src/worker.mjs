import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const VALID_RAILS = new Set(['x402', 'ap2', 'm2m']);
const KIND_BY_RAIL = {
  x402: 'x402-http-402',
  ap2: 'ap2-mandate',
  m2m: 'm2m-session',
};
const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

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

function truthyEnv(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
}

function resolveSolanaRpcUrl(env = process.env) {
  const direct = env.HELIUS_RPC_URL || env.SOLANA_RPC_URL || '';
  if (direct) return direct;

  const apiKey = env.HELIUS_API_KEY || '';
  if (!apiKey) return '';

  const cluster = env.SOLANA_CLUSTER === 'mainnet-beta' ? 'mainnet' : 'devnet';
  return `https://${cluster}.helius-rpc.com/?api-key=${apiKey}`;
}

export function createSolanaVerificationConfig(env = process.env) {
  return {
    enabled: truthyEnv(env.RAIL_WORKER_VERIFY_SOLANA_ANCHOR),
    required: truthyEnv(env.RAIL_WORKER_REQUIRE_SOLANA_VERIFICATION),
    rpcUrl: resolveSolanaRpcUrl(env),
    commitment: env.RAIL_WORKER_SOLANA_COMMITMENT || 'confirmed',
  };
}

export function createAgentConfig(env = process.env) {
  const temperature = Number.parseFloat(env.XAI_TEMPERATURE ?? '0.2');
  const baseUrl = (env.XAI_BASE_URL ?? 'https://api.x.ai/v1').replace(/\/+$/, '');
  return {
    apiKey: env.XAI_API_KEY ?? '',
    baseUrl,
    model: env.XAI_MODEL ?? 'grok-4.20-beta-latest-non-reasoning',
    temperature: Number.isFinite(temperature) ? temperature : 0.2,
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

function clampText(value, fallback = '', max = 240) {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, max);
}

function normalizeRail(value) {
  return VALID_RAILS.has(value) ? value : 'x402';
}

function normalizeSettlement(value) {
  return value === 'evm' ? 'evm' : 'solana';
}

function normalizeProofLayer(value) {
  return value === 'solana' ? 'solana' : 'evm';
}

function normalizeNetwork(value) {
  return value === 'mainnet-beta' ? 'mainnet-beta' : 'devnet';
}

function contextFromProofPayload(proofPayload, railAuthorization, env = process.env) {
  if (!proofPayload || typeof proofPayload !== 'object') {
    return undefined;
  }

  return {
    network: proofPayload.solanaAnchor?.cluster ?? env.SOLANA_CLUSTER ?? 'devnet',
    amountSol: Number(proofPayload.amountLamports ?? '0') / 1_000_000_000,
    recipientFingerprint: proofPayload.recipient
      ? `${String(proofPayload.recipient).slice(0, 4)}...${String(proofPayload.recipient).slice(-4)}#${stableHex(String(proofPayload.recipient), 4)}`
      : 'private-counterparty',
    memoFingerprint: proofPayload.memoHash && proofPayload.memoHash !== '0x'
      ? `${String(proofPayload.memoHash).slice(0, 10)}...${String(proofPayload.memoHash).slice(-6)}`
      : undefined,
    rail: proofPayload.rail,
    settlement: proofPayload.settlement,
    proofLayer: proofPayload.proofLayer,
    durableReceipt: proofPayload.durableReceipt,
    heliusConfigured: Boolean(resolveSolanaRpcUrl(env)),
    evmChainId: proofPayload.evmIntentProof?.eip712?.domain?.chainId ?? Number.parseInt(env.EVM_CHAIN_ID ?? '1', 10),
    evmVerifierConfigured: Boolean(
      proofPayload.evmIntentProof?.eip712?.domain?.verifyingContract || env.EVM_PRIVATE_PAYMENT_VERIFIER,
    ),
    railWorkerConfigured: true,
    hasSolanaAnchor: Boolean(proofPayload.solanaAnchor?.signature),
    solanaAnchorVerified: Boolean(proofPayload.solanaVerification?.memoMatched || railAuthorization?.solanaVerifiedSlot),
    railWorkerMode: proofPayload.railWorker?.mode,
    railWorkerSettlementStatus: proofPayload.railWorker?.settlementStatus,
  };
}

export function sanitizeRailPlanContext(body = {}, env = process.env) {
  const source = body.context && typeof body.context === 'object'
    ? body.context
    : contextFromProofPayload(body.proofPayload, body.railAuthorization, env) ?? body;

  const amountSol = Number(source.amountSol);
  const evmChainId = Number.parseInt(String(source.evmChainId ?? env.EVM_CHAIN_ID ?? '1'), 10);

  return {
    network: normalizeNetwork(source.network ?? env.SOLANA_CLUSTER),
    amountSol: Number.isFinite(amountSol) && amountSol > 0 ? amountSol : 0,
    recipientFingerprint: clampText(source.recipientFingerprint, 'private-counterparty'),
    memoFingerprint: source.memoFingerprint ? clampText(source.memoFingerprint, '', 160) : undefined,
    rail: normalizeRail(source.rail),
    settlement: normalizeSettlement(source.settlement),
    proofLayer: normalizeProofLayer(source.proofLayer),
    durableReceipt: source.durableReceipt === true,
    heliusConfigured: Boolean(resolveSolanaRpcUrl(env) || source.heliusConfigured),
    evmChainId: Number.isFinite(evmChainId) ? evmChainId : 1,
    evmVerifierConfigured: Boolean(env.EVM_PRIVATE_PAYMENT_VERIFIER || source.evmVerifierConfigured),
    railWorkerConfigured: true,
    hasSolanaAnchor: source.hasSolanaAnchor === true,
    solanaAnchorVerified: source.solanaAnchorVerified === true,
    railWorkerMode: clampText(source.railWorkerMode, '', 40) || undefined,
    railWorkerSettlementStatus: clampText(source.railWorkerSettlementStatus, '', 80) || undefined,
    operatorPrompt: source.operatorPrompt
      ? `operator-note#${stableHex(clampText(source.operatorPrompt, '', 500), 6)}`
      : undefined,
  };
}

function scoreRailPlan(actionItems, cautions) {
  if (actionItems.length >= 3 || cautions.some(caution => caution.includes('Do not submit'))) {
    return 'high';
  }

  if (actionItems.length > 0 || cautions.length > 1) {
    return 'medium';
  }

  return 'low';
}

export function createDarkClawdRailPlan(context) {
  const actionItems = [];
  const cautions = [];
  let recommendedRail = context.rail;
  let recommendedSettlement = context.settlement;
  let recommendedProofLayer = context.proofLayer;

  if (!context.durableReceipt) {
    actionItems.push('Enable durable non-ephemeral receipt storage before anchoring or exporting rail auth.');
  }

  if (!context.heliusConfigured) {
    actionItems.push('Configure HELIUS_RPC_URL or HELIUS_API_KEY before mainnet-beta use.');
  }

  if (!context.hasSolanaAnchor) {
    actionItems.push('Anchor the receipt as a wallet-signed Solana Memo before rail submission.');
  } else if (!context.solanaAnchorVerified) {
    actionItems.push('Verify the Solana Memo anchor before EVM proof signing or rail-worker submission.');
  }

  if (!context.railWorkerConfigured) {
    actionItems.push('Set RAIL_WORKER_URL for direct x402/AP2/M2M authorization submission.');
  }

  if (!context.evmVerifierConfigured) {
    actionItems.push('Set EVM_PRIVATE_PAYMENT_VERIFIER before relying on EVM consume-once intent proofing.');
  }

  if (context.amountSol >= 1 || context.network === 'mainnet-beta') {
    recommendedProofLayer = 'evm';
    recommendedSettlement = 'evm';
    recommendedRail = context.rail === 'x402' ? 'ap2' : context.rail;
    cautions.push('High-value or mainnet flow should use AP2/M2M-style mandates plus EVM consume-once proofing.');
  }

  if (context.amountSol < 0.05 && context.network !== 'mainnet-beta') {
    recommendedRail = 'x402';
    recommendedSettlement = 'solana';
    cautions.push('Small devnet test flow can stay on x402/Solana intent mode until backend settlement is configured.');
  }

  if (context.rail === 'm2m' && !context.railWorkerConfigured) {
    cautions.push('Do not submit M2M sessions without a reachable rail worker and replay ledger.');
  }

  if (context.settlement === 'evm' && !context.evmVerifierConfigured) {
    cautions.push('EVM settlement/proof mode is incomplete until the verifier contract address is configured.');
  }

  if (context.railWorkerMode === 'intent-only') {
    cautions.push('Rail worker is in intent-only mode; this proves authorization but does not claim final settlement.');
  }

  if (context.railWorkerSettlementStatus && context.railWorkerSettlementStatus !== 'settled') {
    cautions.push(`Rail settlement status is ${context.railWorkerSettlementStatus}; keep the receipt queued.`);
  }

  if (actionItems.length === 0) {
    actionItems.push('Proceed: stage receipt, anchor on Solana, verify Memo, export/sign EVM proof, then submit rail auth.');
  }

  return {
    recommendedRail,
    recommendedSettlement,
    recommendedProofLayer,
    requireDurableReceipt: true,
    risk: scoreRailPlan(actionItems, cautions),
    summary: `Use ${recommendedRail.toUpperCase()} with ${recommendedSettlement.toUpperCase()} settlement and ${recommendedProofLayer.toUpperCase()} proofing on ${context.network}.`,
    actionItems,
    cautions,
  };
}

function formatRailPlan(plan) {
  return [
    `Risk: ${plan.risk.toUpperCase()}`,
    plan.summary,
    `Recommended: rail=${plan.recommendedRail}, settlement=${plan.recommendedSettlement}, proof=${plan.recommendedProofLayer}, durable=${plan.requireDurableReceipt ? 'yes' : 'no'}`,
    '',
    'Action items:',
    ...plan.actionItems.map(item => `- ${item}`),
    '',
    'Cautions:',
    ...(plan.cautions.length > 0 ? plan.cautions.map(item => `- ${item}`) : ['- No additional cautions from deterministic policy.']),
  ].join('\n');
}

function buildAgentRailPlanPrompt(context, plan) {
  return [
    'You are Dark Clawd, the server-side agentic policy sidecar for a Solana privacy wallet.',
    'Review only public/private-payment metadata. Never request or infer secret keys, seed phrases, full paper-wallet JSON, or plaintext private memos.',
    'The deterministic policy has already produced this plan; critique it and add operational guidance.',
    '',
    `Network: ${context.network}`,
    `Amount SOL: ${context.amountSol}`,
    `Recipient fingerprint: ${context.recipientFingerprint}`,
    context.memoFingerprint ? `Memo fingerprint: ${context.memoFingerprint}` : '',
    `Selected rail: ${context.rail}`,
    `Selected settlement: ${context.settlement}`,
    `Selected proof layer: ${context.proofLayer}`,
    `Durable receipt: ${context.durableReceipt ? 'yes' : 'no'}`,
    `Helius configured: ${context.heliusConfigured ? 'yes' : 'no'}`,
    `EVM chain ID: ${context.evmChainId}`,
    `EVM verifier configured: ${context.evmVerifierConfigured ? 'yes' : 'no'}`,
    `Rail worker configured: ${context.railWorkerConfigured ? 'yes' : 'no'}`,
    `Solana anchor exists: ${context.hasSolanaAnchor ? 'yes' : 'no'}`,
    `Solana anchor verified: ${context.solanaAnchorVerified ? 'yes' : 'no'}`,
    context.railWorkerMode ? `Rail worker mode: ${context.railWorkerMode}` : '',
    context.railWorkerSettlementStatus ? `Rail settlement status: ${context.railWorkerSettlementStatus}` : '',
    context.operatorPrompt ? `Operator note fingerprint: ${context.operatorPrompt}` : '',
    '',
    'Deterministic plan:',
    formatRailPlan(plan),
    '',
    'Return exactly:',
    '1. Go/no-go decision.',
    '2. Best rail choice and why.',
    '3. Next three steps for Solana anchor, EVM intent proof, and x402/AP2/M2M handoff.',
  ].filter(Boolean).join('\n');
}

async function callDarkClawdAgent(prompt, config, fetchImpl = globalThis.fetch) {
  if (!config.apiKey) {
    return {
      ok: true,
      skipped: true,
      reason: 'XAI_API_KEY is not configured on the rail worker',
    };
  }

  if (typeof fetchImpl !== 'function') {
    return {
      ok: false,
      skipped: false,
      error: 'fetch is unavailable for xAI agent review',
    };
  }

  try {
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: config.temperature,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }

    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        status: response.status,
        error: payload.error?.message ?? payload.message ?? `xAI request failed with HTTP ${response.status}`,
      };
    }

    return {
      ok: true,
      skipped: false,
      status: response.status,
      content: payload.choices?.[0]?.message?.content?.trim() ?? '',
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      error: error.message,
    };
  }
}

export async function processAgentRailPlan(body, options = {}) {
  const env = options.env ?? process.env;
  const agentConfig = options.agentConfig ?? createAgentConfig(env);
  const context = sanitizeRailPlanContext(body, env);
  const plan = createDarkClawdRailPlan(context);
  const prompt = buildAgentRailPlanPrompt(context, plan);
  const promptDigest = stableDigest(prompt);
  const agent = await callDarkClawdAgent(
    prompt,
    agentConfig,
    options.fetch ?? globalThis.fetch,
  );

  return {
    ok: true,
    status: 200,
    mode: agent.skipped || !agent.ok ? 'local' : 'xai',
    service: 'dark-clawd-rail-planner',
    agent: {
      available: Boolean(agentConfig.apiKey),
      model: agentConfig.model,
      baseUrl: agentConfig.apiKey ? agentConfig.baseUrl : undefined,
      skipped: agent.skipped,
      error: agent.ok ? undefined : agent.error,
    },
    context,
    plan,
    modelReview: agent.ok && !agent.skipped ? agent.content : undefined,
    promptDigest,
    promptVersion: 1,
  };
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

function decodeBase58(value) {
  const bytes = [0];
  for (const char of value) {
    const digit = BASE58_ALPHABET.indexOf(char);
    if (digit < 0) {
      throw new Error('invalid base58 character');
    }

    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] *= 58;
    }
    bytes[0] += digit;

    let carry = 0;
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] += carry;
      carry = bytes[index] >> 8;
      bytes[index] &= 0xff;
    }

    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (const char of value) {
    if (char !== '1') break;
    bytes.push(0);
  }

  return Uint8Array.from(bytes.reverse());
}

function instructionProgramId(instruction) {
  return instruction?.programId?.toBase58?.()
    ?? instruction?.programId?.toString?.()
    ?? instruction?.programId
    ?? instruction?.program;
}

function memoTextFromInstruction(instruction) {
  const programId = instructionProgramId(instruction);
  if (programId !== MEMO_PROGRAM_ID && instruction?.program !== 'spl-memo') {
    return null;
  }

  if (typeof instruction.parsed === 'string') {
    return instruction.parsed;
  }

  if (typeof instruction.parsed?.memo === 'string') {
    return instruction.parsed.memo;
  }

  if (typeof instruction.parsed?.info?.memo === 'string') {
    return instruction.parsed.info.memo;
  }

  if (Array.isArray(instruction.data) && typeof instruction.data[0] === 'string') {
    const [data, encoding] = instruction.data;
    if (encoding === 'base64') return Buffer.from(data, 'base64').toString('utf8');
    if (encoding === 'base58') return Buffer.from(decodeBase58(data)).toString('utf8');
  }

  if (typeof instruction.data === 'string') {
    try {
      return Buffer.from(decodeBase58(instruction.data)).toString('utf8');
    } catch {
      try {
        return Buffer.from(instruction.data, 'base64').toString('utf8');
      } catch {
        return null;
      }
    }
  }

  return null;
}

function parseDarkMemoPayload(memo) {
  try {
    const parsed = JSON.parse(memo);
    if (
      parsed
      && parsed.protocol === 'zolana.dark'
      && parsed.version === 1
      && parsed.action === 'private_payment'
    ) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function compareSolanaMemoPayload(payload, proof) {
  const expectedMemoHash = proof.memoHash ?? proof.evmIntentProof?.eip712?.message?.memoHash;
  const checks = [
    ['protocol', payload.protocol, 'zolana.dark'],
    ['version', payload.version, 1],
    ['action', payload.action, 'private_payment'],
    ['receiptId', payload.receiptId, proof.receiptId],
    ['recipient', payload.recipient, proof.recipient],
    ['amountLamports', payload.amountLamports, proof.amountLamports],
    ['commitment', payload.commitment, proof.commitmentHex],
    ['rail', payload.rail, proof.rail],
    ['settlement', payload.settlement, proof.settlement],
    ['proofLayer', payload.proofLayer, proof.proofLayer],
    ['durableReceipt', payload.durableReceipt, proof.durableReceipt],
    ['createdAt', payload.createdAt, proof.createdAt],
  ];

  if (proof.solanaAnchor?.payer) {
    checks.push(['payer', payload.payer, proof.solanaAnchor.payer]);
  }

  if (expectedMemoHash && expectedMemoHash !== '0x') {
    checks.push(['memoHash', payload.memoHash, expectedMemoHash]);
  }

  return checks
    .filter(([, actual, expected]) => actual !== expected)
    .map(([field, actual, expected]) => `${field}: expected ${String(expected)}, got ${String(actual)}`);
}

function transactionInstructions(transaction) {
  const message = transaction?.transaction?.message;
  const topLevel = Array.isArray(message?.instructions) ? message.instructions : [];
  const inner = Array.isArray(transaction?.meta?.innerInstructions)
    ? transaction.meta.innerInstructions.flatMap(group => Array.isArray(group.instructions) ? group.instructions : [])
    : [];
  return [...topLevel, ...inner];
}

export async function verifySolanaMemoAnchor(proof, auth, config, fetchImpl = globalThis.fetch) {
  const shouldVerify = config.required || config.enabled;
  if (!shouldVerify) {
    return { ok: true, skipped: true, reason: 'Solana RPC verification is disabled' };
  }

  const signature = auth.solanaAnchorSignature ?? proof.solanaAnchor?.signature;
  if (!signature) {
    return {
      ok: false,
      status: 400,
      errors: ['Solana anchor signature is required for RPC verification'],
    };
  }

  if (!config.rpcUrl) {
    return {
      ok: !config.required,
      skipped: !config.required,
      status: config.required ? 503 : undefined,
      errors: config.required ? ['Solana RPC verification is required but no RPC URL is configured'] : undefined,
      reason: 'No Solana RPC URL configured',
    };
  }

  if (typeof fetchImpl !== 'function') {
    return {
      ok: false,
      status: 503,
      errors: ['Solana RPC verification requires fetch support'],
    };
  }

  let response;
  try {
    response = await fetchImpl(config.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'zolana-rail-worker',
        method: 'getTransaction',
        params: [
          signature,
          {
            encoding: 'jsonParsed',
            commitment: config.commitment,
            maxSupportedTransactionVersion: 0,
          },
        ],
      }),
    });
  } catch (error) {
    return {
      ok: false,
      status: 503,
      errors: [`Solana RPC request failed: ${error.message}`],
    };
  }

  let rpcPayload;
  try {
    rpcPayload = await response.json();
  } catch {
    return {
      ok: false,
      status: 503,
      errors: ['Solana RPC returned a non-JSON response'],
    };
  }

  if (!response.ok || rpcPayload.error) {
    return {
      ok: false,
      status: 503,
      errors: [rpcPayload.error?.message ?? `Solana RPC returned HTTP ${response.status}`],
    };
  }

  const transaction = rpcPayload.result;
  if (!transaction) {
    return {
      ok: false,
      status: 400,
      errors: [`Solana transaction not found: ${signature}`],
    };
  }

  if (transaction.meta?.err) {
    return {
      ok: false,
      status: 400,
      errors: [`Solana transaction failed: ${JSON.stringify(transaction.meta.err)}`],
    };
  }

  for (const instruction of transactionInstructions(transaction)) {
    const memo = memoTextFromInstruction(instruction);
    if (!memo) continue;

    const payload = parseDarkMemoPayload(memo);
    if (!payload) continue;

    const mismatches = compareSolanaMemoPayload(payload, proof);
    if (auth.solanaVerifiedSlot && auth.solanaVerifiedSlot !== transaction.slot) {
      mismatches.push(`solanaVerifiedSlot: expected ${String(transaction.slot)}, got ${String(auth.solanaVerifiedSlot)}`);
    }

    return {
      ok: mismatches.length === 0,
      status: mismatches.length === 0 ? 200 : 400,
      skipped: false,
      signature,
      slot: transaction.slot,
      blockTime: transaction.blockTime,
      payer: payload.payer,
      memoMatched: mismatches.length === 0,
      mismatches,
      errors: mismatches.length ? [`Solana Memo intent mismatch: ${mismatches.join('; ')}`] : undefined,
    };
  }

  return {
    ok: false,
    status: 400,
    errors: ['No matching ZOLana private-payment Memo intent found in Solana transaction'],
  };
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

export function createEvmVerifierPlan(auth, proof, solanaVerification = {}) {
  const solanaSlot = solanaVerification.slot ?? auth.solanaVerifiedSlot ?? proof.solanaVerification?.slot;
  const verifier = auth.evmVerifyingContract || proof.evmIntentProof?.eip712?.domain?.verifyingContract;
  const chainId = auth.evmChainId ?? proof.evmIntentProof?.eip712?.domain?.chainId;
  const digest = auth.evmIntentDigest ?? proof.evmIntentProof?.digest;
  const required = proof.proofLayer === 'evm' || proof.settlement === 'evm' || Boolean(verifier);
  const problems = [];

  if (!required) {
    problems.push('EVM verifier proofing is not required for this receipt');
  }

  if (!verifier) {
    problems.push('EVM verifier contract is not configured');
  }

  if (!digest) {
    problems.push('EVM intent digest is missing');
  }

  if (!Number.isSafeInteger(Number(solanaSlot))) {
    problems.push('Verified Solana slot is required before EVM proof relay');
  }

  const ready = required && problems.length === 0;
  const status = ready
    ? 'ready'
    : problems.includes('EVM verifier proofing is not required for this receipt')
      ? 'not-required'
      : 'blocked';

  const proofPath = `<zolana-private-payment-proof-${proof.receiptId}.json>`;
  const signCommand = verifier
    ? `node dark-protocol/evm-verifier/scripts/sign-intent-proof.mjs --proof ${proofPath} --contract ${verifier} --rpc-url "$EVM_RPC_URL" --sign`
    : undefined;
  const submitCommand = verifier && Number.isSafeInteger(Number(solanaSlot))
    ? `node dark-protocol/evm-verifier/scripts/submit-intent-proof.mjs --proof ${proofPath} --contract ${verifier} --signer "$EVM_INTENT_SIGNER" --signature "$EVM_INTENT_SIGNATURE" --solana-slot ${solanaSlot} --execute`
    : undefined;

  const plan = {
    required,
    ready,
    status,
    receiptId: proof.receiptId,
    rail: auth.rail,
    verifier,
    chainId,
    digest,
    solanaSlot: Number.isSafeInteger(Number(solanaSlot)) ? Number(solanaSlot) : undefined,
    solanaSignature: auth.solanaAnchorSignature,
    solanaCluster: auth.solanaCluster,
    proofPayloadRequired: true,
    signCommand,
    submitCommand,
    problems,
  };

  return {
    ...plan,
    planDigest: stableDigest(JSON.stringify({
      required: plan.required,
      ready: plan.ready,
      status: plan.status,
      receiptId: plan.receiptId,
      rail: plan.rail,
      verifier: plan.verifier,
      chainId: plan.chainId,
      digest: plan.digest,
      solanaSlot: plan.solanaSlot,
      solanaSignature: plan.solanaSignature,
      solanaCluster: plan.solanaCluster,
    })),
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
          solanaRpcVerification: config.solanaVerification,
          evmIntentDigest: auth.evmIntentDigest,
          evmChainId: auth.evmChainId,
          evmVerifyingContract: auth.evmVerifyingContract,
          evmVerifierPlan: createEvmVerifierPlan(auth, proof, config.solanaVerification),
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
    solanaRpcVerified: Boolean(result.solanaVerification && !result.solanaVerification.skipped),
    solanaRpcVerifiedSlot: result.solanaVerification?.slot,
    solanaRpcVerifiedPayer: result.solanaVerification?.payer,
    solanaAnchorSignature: auth.solanaAnchorSignature,
    solanaCluster: auth.solanaCluster,
    solanaVerifiedSlot: auth.solanaVerifiedSlot,
    evmIntentDigest: auth.evmIntentDigest,
    evmChainId: auth.evmChainId,
    evmVerifyingContract: auth.evmVerifyingContract,
    evmVerifierRequired: result.evmVerifierPlan?.required,
    evmVerifierReady: result.evmVerifierPlan?.ready,
    evmVerifierStatus: result.evmVerifierPlan?.status,
    evmVerifierPlanDigest: result.evmVerifierPlan?.planDigest,
    evmVerifierSolanaSlot: result.evmVerifierPlan?.solanaSlot,
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

  const solanaVerificationConfig = options.solanaVerificationConfig
    ?? createSolanaVerificationConfig(options.env ?? process.env);
  const solanaVerification = await verifySolanaMemoAnchor(
    proof,
    auth,
    solanaVerificationConfig,
    options.solanaFetch ?? options.fetch ?? globalThis.fetch,
  );
  if (!solanaVerification.ok) {
    return {
      ok: false,
      status: solanaVerification.status ?? 400,
      rail: auth.rail,
      authorizationId: auth.authorizationId,
      receiptId: auth.receiptId,
      replayKey: auth.replayKey,
      errors: solanaVerification.errors ?? ['Solana Memo verification failed'],
      solanaVerification,
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
    { backendUrls, backendToken, solanaVerification },
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
    result.solanaVerification = solanaVerification;
    result.evmVerifierPlan = createEvmVerifierPlan(auth, proof, solanaVerification);
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
    solanaVerification,
    evmIntentDigest: auth.evmIntentDigest,
    evmVerifierPlan: createEvmVerifierPlan(auth, proof, solanaVerification),
    settlement: backend.settlement,
    headers: x402Headers(auth, proof),
  };
  result.ledger = consumeReplayAndRecord(state, auth, result, now);

  return result;
}

export function responseBody(result) {
  return JSON.stringify(result, null, 2);
}
