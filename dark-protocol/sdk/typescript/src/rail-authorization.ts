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
  x402?: {
    statusCode: 402;
    paymentRequiredHeader: 'PAYMENT-REQUIRED';
    paymentSignatureHeader: 'PAYMENT-SIGNATURE';
    scheme: 'zolana-private-payment';
    facilitator: 'external';
    resource: string;
    payTo: string;
    maxAmountLamports: string;
  };
  ap2?: {
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
  };
  m2m?: {
    sessionId: string;
    machinePayer: string;
    machinePayee: string;
    settlementWindowSeconds: number;
    replayKey: string;
    bindingDigest: string;
  };
}

export interface RailAuthorizationOptions extends PrivatePaymentProofOptions {
  createdAt?: number;
  expiresInSeconds?: number;
  resource?: string;
  machinePayer?: string;
  machinePayee?: string;
}

function stableHex(input: string, bytes = 32): string {
  const encoded = new TextEncoder().encode(input);
  const out = new Uint8Array(bytes);
  for (let index = 0; index < encoded.length; index += 1) {
    out[index % out.length] ^= encoded[index];
    out[(index * 7) % out.length] = (out[(index * 7) % out.length] + encoded[index]) & 0xff;
  }
  return Array.from(out, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function railKind(rail: PrivatePaymentRail): RailAuthorizationKind {
  if (rail === 'x402') return 'x402-http-402';
  if (rail === 'ap2') return 'ap2-mandate';
  return 'm2m-session';
}

export function createRailAuthorizationEnvelope(
  receipt: PrivatePaymentReceipt,
  options: RailAuthorizationOptions = {},
): RailAuthorizationEnvelope {
  if (!receipt.durableReceipt) {
    throw new Error('Rail authorization requires a durable receipt');
  }

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
  const payer = receipt.solanaAnchor?.payer ?? options.machinePayer ?? 'unbound-payer';
  const resource = options.resource ?? `zolana://private-payment/${receipt.id}`;

  const envelopeWithoutId: Omit<RailAuthorizationEnvelope, 'authorizationId'> = {
    domain: 'zolana.dark.rail-authorization',
    version: '1',
    kind: railKind(receipt.rail),
    rail: receipt.rail,
    receiptId: receipt.id,
    createdAt,
    expiresAt,
    replayKey,
    amountLamports: receipt.amountLamports.toString(),
    recipient: receipt.recipient,
    commitmentHex: receipt.commitmentHex,
    durableReceipt: receipt.durableReceipt,
    solanaAnchorSignature: receipt.solanaAnchor?.signature,
    solanaCluster: receipt.solanaAnchor?.cluster,
    solanaVerifiedSlot: receipt.solanaVerification?.slot,
    evmIntentDigest: evmIntent.digest,
    evmChainId: evmIntent.eip712.domain.chainId,
    evmVerifyingContract: evmIntent.eip712.domain.verifyingContract,
    x402: receipt.rail === 'x402' ? {
      statusCode: 402,
      paymentRequiredHeader: 'PAYMENT-REQUIRED',
      paymentSignatureHeader: 'PAYMENT-SIGNATURE',
      scheme: 'zolana-private-payment',
      facilitator: 'external',
      resource,
      payTo: receipt.recipient,
      maxAmountLamports: receipt.amountLamports.toString(),
    } : undefined,
    ap2: receipt.rail === 'ap2' ? {
      mandateId: `ap2_${receipt.id}`,
      agent: 'dark-clawd',
      spender: payer,
      constraints: {
        maxAmountLamports: receipt.amountLamports.toString(),
        recipient: receipt.recipient,
        expiresAt,
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
      replayKey,
      bindingDigest: `0x${stableHex([
        receipt.id,
        receipt.amountLamports.toString(),
        receipt.commitmentHex,
        evmIntent.digest,
      ].join('|'))}`,
    } : undefined,
  };

  return {
    authorizationId: `rail_${receipt.rail}_${stableHex(JSON.stringify(envelopeWithoutId), 16)}`,
    ...envelopeWithoutId,
  };
}

export function serializeRailAuthorizationEnvelope(envelope: RailAuthorizationEnvelope): string {
  return JSON.stringify(envelope, null, 2);
}

