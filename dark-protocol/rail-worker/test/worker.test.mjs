import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createWorkerState,
  processAgentRailPlan,
  processRailRequest,
  sanitizeRailPlanContext,
  stableHex,
  validateRailRequest,
} from '../src/worker.mjs';

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

function privatePaymentMemo(request) {
  const proof = request.proofPayload;
  return {
    protocol: 'zolana.dark',
    version: 1,
    action: 'private_payment',
    payer: proof.solanaAnchor.payer,
    recipient: proof.recipient,
    amountLamports: proof.amountLamports,
    commitment: proof.commitmentHex,
    createdAt: proof.createdAt,
    memoHash: proof.memoHash,
    rail: proof.rail,
    settlement: proof.settlement,
    proofLayer: proof.proofLayer,
    durableReceipt: proof.durableReceipt,
    receiptId: proof.receiptId,
  };
}

function rpcTransaction(request, overrides = {}) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        jsonrpc: '2.0',
        id: 'zolana-rail-worker',
        result: {
          slot: overrides.slot ?? request.proofPayload.solanaVerification.slot,
          blockTime: 1760000000,
          meta: { err: null },
          transaction: {
            message: {
              instructions: [
                {
                  programId: 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
                  parsed: JSON.stringify({
                    ...privatePaymentMemo(request),
                    ...(overrides.memo ?? {}),
                  }),
                },
              ],
            },
          },
        },
      };
    },
  };
}

test('valid x402 rail authorization is accepted and consumes replay key', async () => {
  const state = createWorkerState();
  const first = await processRailRequest(fixture('x402'), state, { now: 1760000002000 });
  assert.equal(first.ok, true);
  assert.equal(first.status, 202);
  assert.equal(first.mode, 'intent-only');
  assert.match(first.headers['PAYMENT-SIGNATURE'], /^rail_x402_/);

  const replay = await processRailRequest(fixture('x402'), state, { now: 1760000003000 });
  assert.equal(replay.ok, false);
  assert.equal(replay.status, 409);
});

test('required Solana RPC Memo verification accepts matching private-payment anchor', async () => {
  const request = fixture('x402');
  const calls = [];
  const result = await processRailRequest(request, createWorkerState(), {
    now: 1760000002000,
    solanaVerificationConfig: {
      enabled: true,
      required: true,
      rpcUrl: 'https://solana-rpc.example',
      commitment: 'confirmed',
    },
    solanaFetch: async (url, init) => {
      calls.push({ url, init });
      return rpcTransaction(request);
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 202);
  assert.equal(result.solanaVerification.skipped, false);
  assert.equal(result.solanaVerification.slot, 12345);
  assert.equal(result.solanaVerification.payer, 'payer111');
  assert.equal(result.ledger.recorded, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://solana-rpc.example');

  const rpcBody = JSON.parse(calls[0].init.body);
  assert.equal(rpcBody.method, 'getTransaction');
  assert.equal(rpcBody.params[0], '5SolanaSignature');
  assert.equal(rpcBody.params[1].encoding, 'jsonParsed');
});

test('Solana RPC Memo mismatch is rejected before replay key is consumed', async () => {
  const request = fixture('ap2');
  const state = createWorkerState();
  const solanaVerificationConfig = {
    enabled: true,
    required: true,
    rpcUrl: 'https://solana-rpc.example',
    commitment: 'confirmed',
  };

  const rejected = await processRailRequest(request, state, {
    now: 1760000002000,
    solanaVerificationConfig,
    solanaFetch: async () => rpcTransaction(request, { memo: { amountLamports: '1' } }),
  });

  assert.equal(rejected.ok, false);
  assert.equal(rejected.status, 400);
  assert.match(rejected.errors.join('\n'), /Solana Memo intent mismatch/);

  const accepted = await processRailRequest(request, state, {
    now: 1760000003000,
    solanaVerificationConfig,
    solanaFetch: async () => rpcTransaction(request),
  });

  assert.equal(accepted.ok, true);
  assert.equal(accepted.status, 200);

  const replay = await processRailRequest(request, state, {
    now: 1760000004000,
    solanaVerificationConfig,
    solanaFetch: async () => rpcTransaction(request),
  });
  assert.equal(replay.ok, false);
  assert.equal(replay.status, 409);
});

test('required Solana verification without RPC config is rejected', async () => {
  const result = await processRailRequest(fixture('m2m'), createWorkerState(), {
    now: 1760000002000,
    solanaVerificationConfig: {
      enabled: false,
      required: true,
      rpcUrl: '',
      commitment: 'confirmed',
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.match(result.errors.join('\n'), /no RPC URL/);
});

test('file-backed rail store persists replay and sanitized settlement ledger across restarts', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zolana-rail-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const storePath = path.join(dir, 'ledger.json');
  const request = fixture('x402');
  const firstState = createWorkerState({ storePath });
  const accepted = await processRailRequest(request, firstState, { now: 1760000002000 });

  assert.equal(accepted.ok, true);
  assert.equal(accepted.ledger.durable, true);
  assert.equal(accepted.ledger.recorded, true);

  const ledger = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  assert.equal(Object.keys(ledger.replayKeys).length, 1);
  assert.equal(ledger.settlements.length, 1);
  assert.equal(ledger.settlements[0].authorizationId, accepted.authorizationId);
  assert.equal(ledger.settlements[0].receiptId, accepted.receiptId);
  assert.equal(ledger.settlements[0].settlementStatus, 'intent-only');
  assert.equal(ledger.settlements[0].recipient, undefined);
  assert.equal(ledger.settlements[0].amountLamports, undefined);

  const restartedState = createWorkerState({ storePath });
  assert.equal(restartedState.replayStore.getSettlement(accepted.authorizationId).receiptId, accepted.receiptId);
  assert.equal(restartedState.replayStore.listSettlements()[0].authorizationId, accepted.authorizationId);

  const replay = await processRailRequest(request, restartedState, { now: 1760000003000 });
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
  assert.match(sent.railAuthorization.authorizationId, /^rail_ap2_/);
  assert.equal(sent.localVerification.evmIntentDigest, sent.proofPayload.evmIntentProof.digest);
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

test('tampered evm proof digest is rejected', async () => {
  const request = fixture('ap2');
  request.proofPayload.evmIntentProof.digest = '0xtampered';
  const result = await processRailRequest(request, createWorkerState(), { now: 1760000002000 });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.errors.join('\n'), /evmIntentProof\.digest/);
});

test('tampered replay key and m2m binding digest are rejected', async () => {
  const request = fixture('m2m');
  request.railAuthorization.replayKey = '0xtampered';
  request.railAuthorization.m2m.replayKey = '0xtampered';
  request.railAuthorization.m2m.bindingDigest = '0xtampered';
  const result = await processRailRequest(request, createWorkerState(), { now: 1760000002000 });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.errors.join('\n'), /replayKey|binding digest/);
});

test('Dark Clawd rail planner returns local guardrails without xAI key', async () => {
  const result = await processAgentRailPlan({
    context: {
      network: 'devnet',
      amountSol: 0.25,
      recipientFingerprint: 'zsol...iver#1234',
      rail: 'x402',
      settlement: 'solana',
      proofLayer: 'evm',
      durableReceipt: true,
      hasSolanaAnchor: false,
      solanaAnchorVerified: false,
    },
  }, {
    env: {},
    fetch: async () => {
      throw new Error('xAI should not be called without XAI_API_KEY');
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.mode, 'local');
  assert.equal(result.agent.available, false);
  assert.equal(result.plan.recommendedRail, 'x402');
  assert.match(result.plan.actionItems.join('\n'), /Anchor the receipt/);
  assert.match(result.plan.actionItems.join('\n'), /HELIUS_RPC_URL|HELIUS_API_KEY/);
});

test('Dark Clawd rail planner calls xAI with public-only fingerprinted prompt', async () => {
  const calls = [];
  const result = await processAgentRailPlan({
    context: {
      network: 'mainnet-beta',
      amountSol: 2,
      recipientFingerprint: 'zsol...iver#1234',
      memoFingerprint: 'memo#abcd',
      rail: 'x402',
      settlement: 'solana',
      proofLayer: 'solana',
      durableReceipt: false,
      hasSolanaAnchor: true,
      solanaAnchorVerified: false,
      operatorPrompt: 'do not leak this full operator note',
      secretKeyJson: '[1,2,3]',
      seedPhrase: 'never include me',
    },
  }, {
    env: {
      XAI_API_KEY: 'xai-secret',
      XAI_BASE_URL: 'https://api.x.ai/v1/',
      XAI_MODEL: 'grok-test',
      HELIUS_API_KEY: 'helius-secret',
      EVM_PRIVATE_PAYMENT_VERIFIER: '0x0000000000000000000000000000000000000402',
    },
    fetch: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [{ message: { content: 'GO after verification. Use AP2 and EVM proof.' } }],
          };
        },
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, 'xai');
  assert.equal(result.agent.available, true);
  assert.equal(result.agent.model, 'grok-test');
  assert.equal(result.modelReview, 'GO after verification. Use AP2 and EVM proof.');
  assert.equal(result.plan.recommendedRail, 'ap2');
  assert.equal(result.plan.recommendedSettlement, 'evm');
  assert.equal(result.plan.recommendedProofLayer, 'evm');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.x.ai/v1/chat/completions');
  assert.equal(calls[0].init.headers.authorization, 'Bearer xai-secret');

  const sent = JSON.parse(calls[0].init.body);
  const prompt = sent.messages[0].content;
  assert.match(prompt, /Recipient fingerprint: zsol\.\.\.iver#1234/);
  assert.match(prompt, /Operator note fingerprint: operator-note#/);
  assert.doesNotMatch(prompt, /do not leak this full operator note/);
  assert.doesNotMatch(prompt, /secretKeyJson|\[1,2,3\]|seedPhrase|never include me|helius-secret|xai-secret/);
});

test('rail plan context can be derived from exported proof payload without raw recipient', () => {
  const request = fixture('m2m');
  const context = sanitizeRailPlanContext(request, {
    HELIUS_RPC_URL: 'https://solana-rpc.example',
    EVM_PRIVATE_PAYMENT_VERIFIER: '0x0000000000000000000000000000000000000402',
  });

  assert.equal(context.rail, 'm2m');
  assert.equal(context.settlement, 'solana');
  assert.equal(context.proofLayer, 'evm');
  assert.equal(context.hasSolanaAnchor, true);
  assert.equal(context.solanaAnchorVerified, true);
  assert.equal(context.heliusConfigured, true);
  assert.equal(context.evmVerifierConfigured, true);
  assert.match(context.recipientFingerprint, /^zsol\.\.\.iver#/);
  assert.notEqual(context.recipientFingerprint, request.proofPayload.recipient);
});
