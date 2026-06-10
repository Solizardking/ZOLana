import {
  createPrivatePaymentEvmIntentProof,
  type PrivatePaymentProofOptions,
  type PrivatePaymentRail,
  type PrivatePaymentReceipt,
} from './private-payment';

export type RailAuthorizationKind = 'x402-http-402' | 'ap2-mandate' | 'm2m-session';

export interface RailAuthorizationEnvelope {
  domain: 'zolana.dark.rail-authorization';
  version: '1';
  authorizationId: string;
  kind: RailAuthorizationKind;
  rail: PrivatePaymentRail;
  receiptId: string;
  createdAt: number;
  expiresAt: number;
  replayKey: string;
  amountLamports: string;
  recipient: string;
  commitmentHex: string;
  durableReceipt: boolean;
  solanaAnchorSignature?: string;
  solanaCluster?: string;
  solanaVerifiedSlot?: number;
  evmIntentDigest: string;
  evmChainId: number;
  evmVerifyingContract?: string;
  x402?: X402Authorization;
  ap2?: AP2MandateAuthorization;
  m2m?: M2MSessionAuthorization;
}

export interface X402Authorization {
  statusCode: 402;
  paymentRequiredHeader: 'PAYMENT-REQUIRED';
  paymentSignatureHeader: 'PAYMENT-SIGNATURE';
  scheme: 'zolana-private-payment';
  facilitator: 'external';
  resource: string;
  payTo: string;
  maxAmountLamports: string;
}

export interface AP2MandateAuthorization {
  mandateId: string;
  agent: 'dark-clawd';
  spender: string;
  constraints: {
    maxAmountLamports: string;
    recipient: string;
    expiresAt: number;
    nonce: string;
    requireSolanaMemoVerification: boolean;
    requireEvmIntentProof: boolean;
  };
}

export interface M2MSessionAuthorization {
  sessionId: string;
  machinePayer: string;
  machinePayee: string;
  settlementWindowSeconds: number;
  replayKey: string;
  bindingDigest: string;
}

export interface RailAuthorizationOptions extends PrivatePaymentProofOptions {
  createdAt?: number;
  expiresInSeconds?: number;
  resource?: string;
  machinePayer?: string;
  machinePayee?: string;
}

export interface RailAuthorizationVerification {
  ok: boolean;
  expectedAuthorizationId: string;
  actualAuthorizationId: string;
  mismatches: string[];
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

function railKind(rail: PrivatePaymentRail): RailAuthorizationKind {
  if (rail === 'x402') return 'x402-http-402';
  if (rail === 'ap2') return 'ap2-mandate';
  return 'm2m-session';
}

function baseEnvelope(
  receipt: PrivatePaymentReceipt,
  options: RailAuthorizationOptions = {},
): Omit<RailAuthorizationEnvelope, 'authorizationId' | 'x402' | 'ap2' | 'm2m'> {
  const createdAt = options.createdAt ?? Date.now();
  const expiresAt = createdAt + (options.expiresInSeconds ?? 600) * 1000;
  const evmIntent = createPrivatePaymentEvmIntentProof(receipt, {
    chainId: options.evmChainId,
    verifyingContract: options.evmVerifyingContract,
  });
  const replayKey = `0x${stableHex([
    receipt.id,
    receipt.nonce,
    receipt.solanaAnchor?.signature ?? '',
    evmIntent.digest,
    expiresAt.toString(),
  ].join('|'))}`;

  return {
    domain: 'zolana.dark.rail-authorization',
    version: '1',
    kind: railKind(receipt.rail),
    rail: receipt.rail,
    receiptId: receipt.id,
    createdAt,
    expiresAt,
    replayKey,
    amountLamports: receipt.amountLamports,
    recipient: receipt.recipient,
    commitmentHex: receipt.commitmentHex,
    durableReceipt: receipt.durableReceipt,
    solanaAnchorSignature: receipt.solanaAnchor?.signature,
    solanaCluster: receipt.solanaAnchor?.cluster,
    solanaVerifiedSlot: receipt.solanaVerification?.slot,
    evmIntentDigest: evmIntent.digest,
    evmChainId: evmIntent.eip712.domain.chainId,
    evmVerifyingContract: evmIntent.eip712.domain.verifyingContract,
  };
}

function authorizationId(envelope: Omit<RailAuthorizationEnvelope, 'authorizationId'>): string {
  return `rail_${envelope.rail}_${stableHex(JSON.stringify(envelope), 16)}`;
}

export function createRailAuthorizationEnvelope(
  receipt: PrivatePaymentReceipt,
  options: RailAuthorizationOptions = {},
): RailAuthorizationEnvelope {
  if (!receipt.durableReceipt) {
    throw new Error('Rail authorization requires a durable receipt');
  }

  const base = baseEnvelope(receipt, options);
  const payer = receipt.solanaAnchor?.payer ?? options.machinePayer ?? 'unbound-payer';
  const resource = options.resource ?? `zolana://private-payment/${receipt.id}`;

  const envelopeWithoutId: Omit<RailAuthorizationEnvelope, 'authorizationId'> = {
    ...base,
    x402: receipt.rail === 'x402' ? {
      statusCode: 402,
      paymentRequiredHeader: 'PAYMENT-REQUIRED',
      paymentSignatureHeader: 'PAYMENT-SIGNATURE',
      scheme: 'zolana-private-payment',
      facilitator: 'external',
      resource,
      payTo: receipt.recipient,
      maxAmountLamports: receipt.amountLamports,
    } : undefined,
    ap2: receipt.rail === 'ap2' ? {
      mandateId: `ap2_${receipt.id}`,
      agent: 'dark-clawd',
      spender: payer,
      constraints: {
        maxAmountLamports: receipt.amountLamports,
        recipient: receipt.recipient,
        expiresAt: base.expiresAt,
        nonce: receipt.nonce,
        requireSolanaMemoVerification: true,
        requireEvmIntentProof: true,
      },
    } : undefined,
    m2m: receipt.rail === 'm2m' ? {
      sessionId: `m2m_${receipt.id}`,
      machinePayer: options.machinePayer ?? payer,
      machinePayee: options.machinePayee ?? receipt.recipient,
      settlementWindowSeconds: options.expiresInSeconds ?? 600,
      replayKey: base.replayKey,
      bindingDigest: `0x${stableHex([
        receipt.id,
        receipt.amountLamports,
        receipt.commitmentHex,
        base.evmIntentDigest,
      ].join('|'))}`,
    } : undefined,
  };

  return {
    authorizationId: authorizationId(envelopeWithoutId),
    ...envelopeWithoutId,
  };
}

export function verifyRailAuthorizationEnvelope(
  envelope: RailAuthorizationEnvelope,
  receipt: PrivatePaymentReceipt,
  options: RailAuthorizationOptions = {},
): RailAuthorizationVerification {
  const expected = createRailAuthorizationEnvelope(receipt, {
    ...options,
    createdAt: envelope.createdAt,
    expiresInSeconds: Math.max(0, Math.round((envelope.expiresAt - envelope.createdAt) / 1000)),
    resource: envelope.x402?.resource ?? options.resource,
    machinePayer: envelope.m2m?.machinePayer ?? options.machinePayer,
    machinePayee: envelope.m2m?.machinePayee ?? options.machinePayee,
  });
  const checks: Array<[string, unknown, unknown]> = [
    ['domain', envelope.domain, expected.domain],
    ['version', envelope.version, expected.version],
    ['authorizationId', envelope.authorizationId, expected.authorizationId],
    ['kind', envelope.kind, expected.kind],
    ['rail', envelope.rail, expected.rail],
    ['receiptId', envelope.receiptId, expected.receiptId],
    ['replayKey', envelope.replayKey, expected.replayKey],
    ['amountLamports', envelope.amountLamports, expected.amountLamports],
    ['recipient', envelope.recipient, expected.recipient],
    ['commitmentHex', envelope.commitmentHex, expected.commitmentHex],
    ['evmIntentDigest', envelope.evmIntentDigest, expected.evmIntentDigest],
    ['solanaAnchorSignature', envelope.solanaAnchorSignature, expected.solanaAnchorSignature],
  ];

  const mismatches = checks
    .filter(([, actual, expectedValue]) => actual !== expectedValue)
    .map(([field, actual, expectedValue]) => `${field}: expected ${String(expectedValue)}, got ${String(actual)}`);

  return {
    ok: mismatches.length === 0,
    expectedAuthorizationId: expected.authorizationId,
    actualAuthorizationId: envelope.authorizationId,
    mismatches,
  };
}

export function serializeRailAuthorizationEnvelope(envelope: RailAuthorizationEnvelope): string {
  return JSON.stringify(envelope, null, 2);
}

