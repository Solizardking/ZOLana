import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createVerifierIntentFromProofPayload } from './intent-proof.mjs';
import {
  INTENT_TUPLE_TYPE,
  buildIntentTupleArg,
} from './submit-intent-proof.mjs';

const HASH_SIGNATURE = `hashIntent(${INTENT_TUPLE_TYPE})`;

function usage() {
  return [
    'Usage:',
    '  node scripts/sign-intent-proof.mjs --proof zolana-private-payment-proof.json --dry-run',
    '  node scripts/sign-intent-proof.mjs --proof proof.json --contract 0x... --rpc-url https://... --intent-private-key 0x... --sign',
    '',
    'Environment fallback:',
    '  EVM_PRIVATE_PAYMENT_VERIFIER=0x...',
    '  EVM_RPC_URL=https://...',
    '  EVM_INTENT_PRIVATE_KEY=0x...',
    '',
    'The script uses Foundry cast. Dry-run is the default and never signs.',
  ].join('\n');
}

export function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const options = {
    proofPath: '',
    contract: env.EVM_PRIVATE_PAYMENT_VERIFIER ?? '',
    rpcUrl: env.EVM_RPC_URL ?? '',
    intentPrivateKey: env.EVM_INTENT_PRIVATE_KEY ?? '',
    dryRun: true,
    sign: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value`);
      return argv[index];
    };

    if (arg === '--proof') options.proofPath = next();
    else if (arg === '--contract') options.contract = next();
    else if (arg === '--rpc-url') options.rpcUrl = next();
    else if (arg === '--intent-private-key') options.intentPrivateKey = next();
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--sign') {
      options.sign = true;
      options.dryRun = false;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function assertHexAddress(value, label) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${label} must be an EVM address`);
  }
}

function assertPrivateKey(value, label = 'EVM_INTENT_PRIVATE_KEY') {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a 32-byte 0x-prefixed private key`);
  }
}

export function readProofPayload(proofPath) {
  const raw = proofPath
    ? fs.readFileSync(proofPath, 'utf8')
    : fs.readFileSync(0, 'utf8');
  return JSON.parse(raw);
}

export function buildHashIntentArgs(intent, options) {
  assertHexAddress(options.contract, 'Verifier contract');
  const args = [
    'call',
    options.contract,
    HASH_SIGNATURE,
    buildIntentTupleArg(intent),
  ];
  if (options.rpcUrl) args.push('--rpc-url', options.rpcUrl);
  return args;
}

export function buildWalletSignArgs(digest, options) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(digest)) {
    throw new Error('Verifier digest must be 32-byte 0x-prefixed hex');
  }
  assertPrivateKey(options.intentPrivateKey);
  return [
    'wallet',
    'sign',
    '--no-hash',
    digest,
    '--private-key',
    options.intentPrivateKey,
  ];
}

function redactArgs(args) {
  const redacted = [...args];
  const privateKeyIndex = redacted.indexOf('--private-key');
  if (privateKeyIndex >= 0 && redacted[privateKeyIndex + 1]) {
    redacted[privateKeyIndex + 1] = '<redacted>';
  }
  return redacted;
}

export function createPlan(payload, options) {
  const intent = createVerifierIntentFromProofPayload(payload);
  const hashArgs = buildHashIntentArgs(intent, options);
  const signArgs = options.intentPrivateKey
    ? redactArgs(buildWalletSignArgs(`0x${'00'.repeat(32)}`, options))
    : ['wallet', 'sign', '--no-hash', '<digest-from-hashIntent>', '--private-key', '<redacted>'];

  return {
    mode: options.sign ? 'sign' : 'dry-run',
    verifier: options.contract,
    receiptId: intent.receiptId,
    rail: intent.rail,
    settlement: intent.settlement,
    proofLayer: intent.proofLayer,
    solanaSignature: intent.solanaSignature,
    solanaCluster: intent.solanaCluster,
    cast: {
      hashIntent: {
        bin: 'cast',
        args: hashArgs,
      },
      signDigest: {
        bin: 'cast',
        args: signArgs,
      },
    },
    intent,
  };
}

function validateSigningOptions(options) {
  if (!options.contract) throw new Error('Verifier contract is required via --contract or EVM_PRIVATE_PAYMENT_VERIFIER');
  if (options.sign) {
    if (!options.rpcUrl) throw new Error('EVM_RPC_URL or --rpc-url is required with --sign');
    if (!options.intentPrivateKey) throw new Error('EVM_INTENT_PRIVATE_KEY or --intent-private-key is required with --sign');
    assertPrivateKey(options.intentPrivateKey);
  }
}

export async function runCast(castArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn('cast', castArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`cast failed with code ${code}: ${stderr || stdout}`));
    });
  });
}

function extractDigest(stdout) {
  const match = stdout.match(/0x[a-fA-F0-9]{64}/);
  if (!match) {
    throw new Error(`Unable to parse verifier digest from cast call output: ${stdout.trim()}`);
  }
  return match[0];
}

function extractSignature(stdout) {
  const match = stdout.match(/0x[a-fA-F0-9]{130}/);
  if (!match) {
    throw new Error(`Unable to parse signature from cast wallet sign output: ${stdout.trim()}`);
  }
  return match[0];
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv, env);
  if (options.help) {
    console.log(usage());
    return;
  }

  validateSigningOptions(options);
  const payload = readProofPayload(options.proofPath);
  const plan = createPlan(payload, options);

  if (!options.sign) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const hashResult = await runCast(buildHashIntentArgs(plan.intent, options));
  const digest = extractDigest(hashResult.stdout);
  const signResult = await runCast(buildWalletSignArgs(digest, options));
  const signature = extractSignature(signResult.stdout);

  console.log(JSON.stringify({
    ok: true,
    receiptId: plan.receiptId,
    rail: plan.rail,
    verifier: plan.verifier,
    digest,
    signature,
    signerHint: 'Run `cast wallet address --private-key <EVM_INTENT_PRIVATE_KEY>` to derive EVM_INTENT_SIGNER.',
  }, null, 2));
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(error => {
    console.error(error.message);
    console.error('');
    console.error(usage());
    process.exitCode = 1;
  });
}
