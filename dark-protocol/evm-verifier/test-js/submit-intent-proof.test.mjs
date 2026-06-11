import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCastArgs,
  createPlan,
  parseArgs,
} from '../scripts/submit-intent-proof.mjs';

function proofPayload() {
  return {
    domain: 'zolana.dark.private-payment',
    version: '1',
    receiptId: 'pay_test_001',
    rail: 'x402',
    settlement: 'solana',
    proofLayer: 'evm',
    durableReceipt: true,
    recipient: 'zsol1receiver',
    amountLamports: '250000000',
    commitmentHex: '0xabc',
    nonce: '0x0102030405060708090a0b0c0d0e0f10',
    createdAt: 1760000000000,
    status: 'anchored',
    evmIntentProof: {
      eip712: {
        message: {
          receiptId: 'pay_test_001',
          rail: 'x402',
          settlement: 'solana',
          proofLayer: 'evm',
          durableReceipt: true,
          recipient: 'zsol1receiver',
          amountLamports: '250000000',
          commitmentHex: '0xabc',
          nonce: '0x0102030405060708090a0b0c0d0e0f10',
          memoHash: '0x',
          solanaSignature: '5SolanaSignature',
          solanaCluster: 'devnet',
          createdAt: '1760000000000',
        },
      },
    },
  };
}

function validOptions(overrides = {}) {
  return {
    contract: '0x0000000000000000000000000000000000000402',
    signer: '0x1111111111111111111111111111111111111111',
    signature: `0x${'ab'.repeat(65)}`,
    solanaSlot: '12345',
    rpcUrl: 'https://evm-rpc.example',
    privateKey: `0x${'cd'.repeat(32)}`,
    dryRun: true,
    execute: false,
    ...overrides,
  };
}

test('parseArgs reads CLI args and environment fallbacks', () => {
  const parsed = parseArgs(
    ['--proof', 'proof.json', '--solana-slot', '99', '--execute'],
    {
      EVM_PRIVATE_PAYMENT_VERIFIER: '0x0000000000000000000000000000000000000402',
      EVM_RPC_URL: 'https://rpc.example',
      EVM_PRIVATE_KEY: `0x${'11'.repeat(32)}`,
      EVM_INTENT_SIGNER: '0x2222222222222222222222222222222222222222',
      EVM_INTENT_SIGNATURE: `0x${'aa'.repeat(65)}`,
    },
  );

  assert.equal(parsed.proofPath, 'proof.json');
  assert.equal(parsed.solanaSlot, '99');
  assert.equal(parsed.execute, true);
  assert.equal(parsed.dryRun, false);
  assert.equal(parsed.rpcUrl, 'https://rpc.example');
});

test('createPlan builds a dry-run cast send command without leaking private key', () => {
  const plan = createPlan(proofPayload(), validOptions());

  assert.equal(plan.mode, 'dry-run');
  assert.equal(plan.receiptId, 'pay_test_001');
  assert.equal(plan.rail, 'x402');
  assert.equal(plan.cast.bin, 'cast');
  assert.equal(plan.cast.args[0], 'send');
  assert.equal(plan.cast.args[1], '0x0000000000000000000000000000000000000402');
  assert.equal(plan.cast.args.includes('<redacted>'), true);
  assert.equal(plan.cast.args.includes(validOptions().privateKey), false);
  assert.match(plan.cast.args[3], /^\("pay_test_001","x402","solana","evm",true,/);
});

test('buildCastArgs rejects invalid signature length', () => {
  assert.throws(
    () => buildCastArgs(createPlan(proofPayload(), validOptions()).intent, validOptions({ signature: '0x1234' })),
    /Intent signature must be 65 bytes/,
  );
});

test('buildCastArgs rejects missing solana slot', () => {
  assert.throws(
    () => buildCastArgs(createPlan(proofPayload(), validOptions()).intent, validOptions({ solanaSlot: '' })),
    /Solana slot/,
  );
});
