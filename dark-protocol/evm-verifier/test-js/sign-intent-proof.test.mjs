import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHashIntentArgs,
  buildWalletSignArgs,
  createPlan,
  parseArgs,
} from '../scripts/sign-intent-proof.mjs';

function proofPayload() {
  return {
    evmIntentProof: {
      eip712: {
        message: {
          receiptId: 'pay_test_001',
          rail: 'ap2',
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
    rpcUrl: 'https://evm-rpc.example',
    intentPrivateKey: `0x${'ef'.repeat(32)}`,
    dryRun: true,
    sign: false,
    ...overrides,
  };
}

test('parseArgs reads signer env and --sign flag', () => {
  const parsed = parseArgs(
    ['--proof', 'proof.json', '--sign'],
    {
      EVM_PRIVATE_PAYMENT_VERIFIER: '0x0000000000000000000000000000000000000402',
      EVM_RPC_URL: 'https://rpc.example',
      EVM_INTENT_PRIVATE_KEY: `0x${'12'.repeat(32)}`,
    },
  );

  assert.equal(parsed.proofPath, 'proof.json');
  assert.equal(parsed.sign, true);
  assert.equal(parsed.dryRun, false);
  assert.equal(parsed.intentPrivateKey, `0x${'12'.repeat(32)}`);
});

test('buildHashIntentArgs creates cast call over the shared intent tuple', () => {
  const plan = createPlan(proofPayload(), validOptions());
  const args = buildHashIntentArgs(plan.intent, validOptions());

  assert.equal(args[0], 'call');
  assert.equal(args[1], '0x0000000000000000000000000000000000000402');
  assert.match(args[2], /^hashIntent\(\(string,string,string,string,bool,/);
  assert.match(args[3], /^\("pay_test_001","ap2","solana","evm",true,/);
  assert.equal(args.includes('--rpc-url'), true);
});

test('buildWalletSignArgs signs a raw verifier digest without hashing again', () => {
  const args = buildWalletSignArgs(`0x${'ab'.repeat(32)}`, validOptions());

  assert.deepEqual(args.slice(0, 4), ['wallet', 'sign', '--no-hash', `0x${'ab'.repeat(32)}`]);
  assert.equal(args.includes('--private-key'), true);
});

test('createPlan redacts intent private key', () => {
  const plan = createPlan(proofPayload(), validOptions());

  assert.equal(plan.mode, 'dry-run');
  assert.equal(plan.cast.signDigest.args.includes('<redacted>'), true);
  assert.equal(plan.cast.signDigest.args.includes(validOptions().intentPrivateKey), false);
});

test('buildWalletSignArgs rejects non-32-byte digest', () => {
  assert.throws(
    () => buildWalletSignArgs('0x1234', validOptions()),
    /Verifier digest/,
  );
});

test('buildWalletSignArgs rejects invalid signer private key', () => {
  assert.throws(
    () => buildWalletSignArgs(`0x${'ab'.repeat(32)}`, validOptions({ intentPrivateKey: '0x1234' })),
    /EVM_INTENT_PRIVATE_KEY/,
  );
});
