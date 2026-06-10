import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerState, processRailRequest, stableHex, validateRailRequest } from '../src/worker.mjs';

function authorizationId(envelope) {
  const { authorizationId, ...withoutId } = envelope;
  return `rail_${envelope.rail}_${stableHex(JSON.stringify(withoutId), 16)}`;
}

function fixture(rail = 'x402') {
  const proofPayload = {
    domain: 'zolana.dark.private-payment',
    version: '1',
    receiptId: 'pay_test_001',
    rail,
    settlement: 'solana',
    proofLayer: 'evm',
    durableReceipt: true,
    recipient: 'zsol1receiver',
    amountLamports: '250000000',
    commitmentHex: '0xabc',
    nonce: '0x0102030405060708090a0b0c0d0e0f10',
    createdAt: 1760000000000,
    status: 'anchored',
    memoHash: '0x',
    solanaAnchor: {
      signature: '5SolanaSignature',
      cluster: 'devnet',
      payer: 'payer111',
      anchoredAt: 1760000000500,
      commitment: 'confirmed',
      explorerUrl: 'https://explorer.solana.com/tx/5SolanaSignature?cluster=devnet',
    },
    solanaVerification: {
      verifiedAt: 1760000000600,
      signature: '5SolanaSignature',
      slot: 12345,
      payer: 'payer111',
      memoMatched: true,
    },
    evmIntentProof: {
      domain: 'zolana.dark.evm-intent',
      version: '1',
      digest: '',
      eip712: {
        domain: {
          name: 'ZOLana Dark Private Payment',
          version: '1',
          chainId: 1,
          verifyingContract: '0x0000000000000000000000000000000000000402',
        },
        primaryType: 'PrivatePaymentIntent',
        types: {
          PrivatePaymentIntent: [
            { name: 'receiptId', type: 'string' },
            { name: 'rail', type: 'string' },
            { name: 'settlement', type: 'string' },
            { name: 'proofLayer', type: 'string' },
            { name: 'durableReceipt', type: 'bool' },
            { name: 'recipient', type: 'string' },
            { name: 'amountLamports', type: 'string' },
            { name: 'commitmentHex', type: 'bytes32' },
            { name: 'nonce', type: 'bytes16' },
            { name: 'memoHash', type: 'bytes16' },
            { name: 'solanaSignature', type: 'string' },
            { name: 'solanaCluster', type: 'string' },
            { name: 'createdAt', type: 'string' },
          ],
        },
        message: {},
      },
    },
  };
  proofPayload.evmIntentProof.eip712.message = {
    receiptId: proofPayload.receiptId,
    rail: proofPayload.rail,
    settlement: proofPayload.settlement,
    proofLayer: proofPayload.proofLayer,
    durableReceipt: proofPayload.durableReceipt,
    recipient: proofPayload.recipient,
    amountLamports: proofPayload.amountLamports,
    commitmentHex: proofPayload.commitmentHex,
    nonce: proofPayload.nonce,
    memoHash: proofPayload.memoHash,
    solanaSignature: proofPayload.solanaAnchor.signature,
    solanaCluster: proofPayload.solanaAnchor.cluster,
    createdAt: String(proofPayload.createdAt),
  };
  proofPayload.evmIntentProof.digest = `0x${stableHex(JSON.stringify(proofPayload.evmIntentProof.eip712))}`;

  const base = {
    domain: 'zolana.dark.rail-authorization',
    version: '1',
    authorizationId: '',
    kind: rail === 'x402' ? 'x402-http-402' : rail === 'ap2' ? 'ap2-mandate' : 'm2m-session',
    rail,
    receiptId: proofPayload.receiptId,
    createdAt: 1760000001000,
    expiresAt: 1760000601000,
    replayKey: '',
    amountLamports: proofPayload.amountLamports,
    recipient: proofPayload.recipient,
    commitmentHex: proofPayload.commitmentHex,
    durableReceipt: true,
    solanaAnchorSignature: proofPayload.solanaAnchor.signature,
    solanaCluster: proofPayload.solanaAnchor.cluster,
    solanaVerifiedSlot: proofPayload.solanaVerification.slot,
    evmIntentDigest: proofPayload.evmIntentProof.digest,
    evmChainId: 1,
    evmVerifyingContract: '0x0000000000000000000000000000000000000402',
  };
  base.replayKey = `0x${stableHex([
    proofPayload.receiptId,
    proofPayload.nonce,
    proofPayload.solanaAnchor.signature,
    proofPayload.evmIntentProof.digest,
    String(base.expiresAt),
  ].join('|'))}`;

  if (rail === 'x402') {
    base.x402 = {
      statusCode: 402,
      paymentRequiredHeader: 'PAYMENT-REQUIRED',
      paymentSignatureHeader: 'PAYMENT-SIGNATURE',
      scheme: 'zolana-private-payment',
      facilitator: 'external',
      resource: 'zolana://private-payment/pay_test_001',
      payTo: proofPayload.recipient,
      maxAmountLamports: proofPayload.amountLamports,
    };
  }

  if (rail === 'ap2') {
    base.ap2 = {
      mandateId: 'ap2_pay_test_001',
      agent: 'dark-clawd',
      spender: 'payer111',
      constraints: {
        maxAmountLamports: proofPayload.amountLamports,
        recipient: proofPayload.recipient,
        expiresAt: base.expiresAt,
        nonce: proofPayload.nonce,
        requireSolanaMemoVerification: true,
        requireEvmIntentProof: true,
      },
    };
  }

  if (rail === 'm2m') {
    base.m2m = {
      sessionId: 'm2m_pay_test_001',
      machinePayer: 'payer111',
      machinePayee: proofPayload.recipient,
      settlementWindowSeconds: 600,
      replayKey: base.replayKey,
      bindingDigest: `0x${stableHex([
        proofPayload.receiptId,
        proofPayload.amountLamports,
        proofPayload.commitmentHex,
        proofPayload.evmIntentProof.digest,
      ].join('|'))}`,
    };
  }

  base.authorizationId = authorizationId(base);
  return { proofPayload, railAuthorization: base };
}

test('valid x402 rail authorization is accepted and consumes replay key', () => {
  const state = createWorkerState();
  const first = processRailRequest(fixture('x402'), state, { now: 1760000002000 });
  assert.equal(first.ok, true);
  assert.equal(first.status, 202);
  assert.equal(first.mode, 'intent-only');
  assert.match(first.headers['PAYMENT-SIGNATURE'], /^rail_x402_/);

  const replay = processRailRequest(fixture('x402'), state, { now: 1760000003000 });
  assert.equal(replay.ok, false);
  assert.equal(replay.status, 409);
});

test('ap2 and m2m envelopes validate their rail-specific constraints', () => {
  assert.equal(validateRailRequest(fixture('ap2'), { now: 1760000002000 }).ok, true);
  assert.equal(validateRailRequest(fixture('m2m'), { now: 1760000002000 }).ok, true);
});

test('expired rail authorization is rejected', () => {
  const request = fixture('m2m');
  request.railAuthorization.expiresAt = 10;
  const result = processRailRequest(request, createWorkerState(), { now: 1760000002000 });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.errors.join('\n'), /expired/);
});

test('tampered evm proof digest is rejected', () => {
  const request = fixture('ap2');
  request.proofPayload.evmIntentProof.digest = '0xtampered';
  const result = processRailRequest(request, createWorkerState(), { now: 1760000002000 });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.errors.join('\n'), /evmIntentProof\.digest/);
});

test('tampered replay key and m2m binding digest are rejected', () => {
  const request = fixture('m2m');
  request.railAuthorization.replayKey = '0xtampered';
  request.railAuthorization.m2m.replayKey = '0xtampered';
  request.railAuthorization.m2m.bindingDigest = '0xtampered';
  const result = processRailRequest(request, createWorkerState(), { now: 1760000002000 });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.errors.join('\n'), /replayKey|binding digest/);
});
