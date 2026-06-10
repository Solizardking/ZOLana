import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkerState, processRailRequest, validateRailRequest } from '../src/worker.mjs';

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
      digest: '0xdigest',
      eip712: {
        domain: {
          name: 'ZOLana Dark Private Payment',
          version: '1',
          chainId: 1,
          verifyingContract: '0x0000000000000000000000000000000000000402',
        },
      },
    },
  };

  const base = {
    domain: 'zolana.dark.rail-authorization',
    version: '1',
    authorizationId: `rail_${rail}_fixture`,
    kind: rail === 'x402' ? 'x402-http-402' : rail === 'ap2' ? 'ap2-mandate' : 'm2m-session',
    rail,
    receiptId: proofPayload.receiptId,
    createdAt: 1760000001000,
    expiresAt: 1760000601000,
    replayKey: '0xreplay',
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
      bindingDigest: '0xbinding',
    };
  }

  return { proofPayload, railAuthorization: base };
}

test('valid x402 rail authorization is accepted and consumes replay key', async () => {
  const state = createWorkerState();
  const first = await processRailRequest(fixture('x402'), state, { now: 1760000002000 });
  assert.equal(first.ok, true);
  assert.equal(first.status, 202);
  assert.equal(first.mode, 'intent-only');
  assert.equal(first.headers['PAYMENT-SIGNATURE'], 'rail_x402_fixture');

  const replay = await processRailRequest(fixture('x402'), state, { now: 1760000003000 });
  assert.equal(replay.ok, false);
  assert.equal(replay.status, 409);
});

test('ap2 and m2m envelopes validate their rail-specific constraints', () => {
  assert.equal(validateRailRequest(fixture('ap2'), { now: 1760000002000 }).ok, true);
  assert.equal(validateRailRequest(fixture('m2m'), { now: 1760000002000 }).ok, true);
});

test('expired rail authorization is rejected', async () => {
  const request = fixture('m2m');
  request.railAuthorization.expiresAt = 10;
  const result = await processRailRequest(request, createWorkerState(), { now: 1760000002000 });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.errors.join('\n'), /expired/);
});

test('configured settlement backend is called and normalized', async () => {
  const calls = [];
  const result = await processRailRequest(fixture('ap2'), createWorkerState(), {
    now: 1760000002000,
    backendUrls: { ap2: 'https://settlement.example/ap2' },
    backendToken: 'rail-secret',
    fetch: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 202,
        async json() {
          return {
            ok: true,
            settlementStatus: 'pending',
            settlementId: 'set_001',
            transactionId: 'tx_001',
            evidence: { queue: 'ap2-runner' },
          };
        },
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 202);
  assert.equal(result.mode, 'backend');
  assert.equal(result.settlement.settled, false);
  assert.equal(result.settlement.status, 'pending');
  assert.equal(result.settlement.settlementId, 'set_001');
  assert.equal(result.settlement.transactionId, 'tx_001');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://settlement.example/ap2');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.authorization, 'Bearer rail-secret');

  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.rail, 'ap2');
  assert.equal(sent.railAuthorization.authorizationId, 'rail_ap2_fixture');
  assert.equal(sent.localVerification.evmIntentDigest, '0xdigest');
});

test('backend failure does not consume replay key', async () => {
  const request = fixture('m2m');
  const state = createWorkerState();
  const backendUrls = { m2m: 'https://settlement.example/m2m' };

  const failed = await processRailRequest(request, state, {
    now: 1760000002000,
    backendUrls,
    fetch: async () => ({
      ok: false,
      status: 503,
      async json() {
        return { ok: false, error: 'backend unavailable' };
      },
    }),
  });

  assert.equal(failed.ok, false);
  assert.equal(failed.status, 502);
  assert.equal(failed.backendStatus, 503);
  assert.match(failed.errors.join('\n'), /backend unavailable/);

  const accepted = await processRailRequest(request, state, {
    now: 1760000003000,
    backendUrls,
    fetch: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          settlementStatus: 'settled',
          settlementId: 'set_002',
          transactionId: 'sig_002',
        };
      },
    }),
  });

  assert.equal(accepted.ok, true);
  assert.equal(accepted.status, 200);
  assert.equal(accepted.mode, 'backend');
  assert.equal(accepted.settlement.settled, true);
  assert.equal(accepted.settlement.transactionId, 'sig_002');

  const replay = await processRailRequest(request, state, {
    now: 1760000004000,
    backendUrls,
    fetch: async () => {
      throw new Error('replay should fail before backend call');
    },
  });
  assert.equal(replay.ok, false);
  assert.equal(replay.status, 409);
});
