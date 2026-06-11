import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createVerifierIntentFromProofPayload } from './intent-proof.mjs';

export const INTENT_TUPLE_TYPE = '(string,string,string,string,bool,string,string,string,string,string,string,string,string)';
export const RECORD_SIGNATURE = `recordIntentProof(${INTENT_TUPLE_TYPE},address,bytes,uint256)`;

function usage() {
  return [
    'Usage:',
    '  node scripts/submit-intent-proof.mjs --proof zolana-private-payment-proof.json --dry-run',
    '  node scripts/submit-intent-proof.mjs --proof proof.json --signer 0x... --signature 0x... --solana-slot 12345 --execute',
    '',
    'Environment fallback:',
    '  EVM_PRIVATE_PAYMENT_VERIFIER=0x...',
    '  EVM_RPC_URL=https://...',
    '  EVM_PRIVATE_KEY=0x...',
    '  EVM_INTENT_SIGNER=0x...',
    '  EVM_INTENT_SIGNATURE=0x...',
    '',
    'The script uses Foundry cast. Dry-run is the default and never broadcasts.',
  ].join('\n');
}

export function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const options = {
    proofPath: '',
    contract: env.EVM_PRIVATE_PAYMENT_VERIFIER ?? '',
    rpcUrl: env.EVM_RPC_URL ?? '',
    privateKey: env.EVM_PRIVATE_KEY ?? '',
    signer: env.EVM_INTENT_SIGNER ?? '',
    signature: env.EVM_INTENT_SIGNATURE ?? '',
    solanaSlot: env.SOLANA_VERIFIED_SLOT ?? '',
    dryRun: true,
    execute: false,
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
    else if (arg === '--private-key') options.privateKey = next();
    else if (arg === '--signer') options.signer = next();
    else if (arg === '--signature') options.signature = next();
    else if (arg === '--solana-slot') options.solanaSlot = next();
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--execute') {
      options.execute = true;
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

function assertHexBytes(value, label, expectedBytes) {
  if (!/^0x([a-fA-F0-9]{2})+$/.test(value)) {
    throw new Error(`${label} must be 0x-prefixed hex bytes`);
  }
  if (expectedBytes !== undefined && (value.length - 2) / 2 !== expectedBytes) {
    throw new Error(`${label} must be ${expectedBytes} bytes`);
  }
}

function assertPrivateKey(value) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error('EVM_PRIVATE_KEY must be a 32-byte 0x-prefixed private key');
  }
}

export function readProofPayload(proofPath) {
  const raw = proofPath
    ? fs.readFileSync(proofPath, 'utf8')
    : fs.readFileSync(0, 'utf8');
  return JSON.parse(raw);
}

export function buildCastArgs(intent, options) {
  assertHexAddress(options.contract, 'Verifier contract');
  assertHexAddress(options.signer, 'Intent signer');
  assertHexBytes(options.signature, 'Intent signature', 65);

  const solanaSlot = Number.parseInt(String(options.solanaSlot), 10);
  if (!Number.isSafeInteger(solanaSlot) || solanaSlot < 0) {
    throw new Error('Solana slot must be a non-negative safe integer');
  }

  const tuple = buildIntentTupleArg(intent);

  const args = [
    'send',
    options.contract,
    RECORD_SIGNATURE,
    tuple,
    options.signer,
    options.signature,
    String(solanaSlot),
  ];

  if (options.rpcUrl) args.push('--rpc-url', options.rpcUrl);
  if (options.privateKey) args.push('--private-key', options.privateKey);

  return args;
}

export function buildIntentTupleArg(intent) {
  return castTuple([
    castString(intent.receiptId),
    castString(intent.rail),
    castString(intent.settlement),
    castString(intent.proofLayer),
    intent.durableReceipt ? 'true' : 'false',
    castString(intent.recipient),
    castString(intent.amountLamports),
    castString(intent.commitmentHex),
    castString(intent.nonce),
    castString(intent.memoHash || '0x'),
    castString(intent.solanaSignature),
    castString(intent.solanaCluster),
    castString(intent.createdAt),
  ]);
}

function castString(value) {
  const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function castTuple(values) {
  return `(${values.join(',')})`;
}

function redactCastArgs(args) {
  const redacted = [...args];
  const privateKeyIndex = redacted.indexOf('--private-key');
  if (privateKeyIndex >= 0 && redacted[privateKeyIndex + 1]) {
    redacted[privateKeyIndex + 1] = '<redacted>';
  }
  return redacted;
}

export function createPlan(payload, options) {
  const intent = createVerifierIntentFromProofPayload(payload);
  const castArgs = buildCastArgs(intent, options);

  return {
    mode: options.execute ? 'execute' : 'dry-run',
    verifier: options.contract,
    signer: options.signer,
    solanaSlot: Number.parseInt(String(options.solanaSlot), 10),
    receiptId: intent.receiptId,
    rail: intent.rail,
    settlement: intent.settlement,
    proofLayer: intent.proofLayer,
    solanaSignature: intent.solanaSignature,
    solanaCluster: intent.solanaCluster,
    cast: {
      bin: 'cast',
      args: redactCastArgs(castArgs),
    },
    intent,
  };
}

function validateExecutionOptions(options) {
  if (!options.contract) throw new Error('Verifier contract is required via --contract or EVM_PRIVATE_PAYMENT_VERIFIER');
  if (!options.signer) throw new Error('Intent signer is required via --signer or EVM_INTENT_SIGNER');
  if (!options.signature) throw new Error('Intent signature is required via --signature or EVM_INTENT_SIGNATURE');
  if (!options.solanaSlot) throw new Error('Solana verified slot is required via --solana-slot or SOLANA_VERIFIED_SLOT');
  if (options.execute) {
    if (!options.rpcUrl) throw new Error('EVM_RPC_URL or --rpc-url is required with --execute');
    if (!options.privateKey) throw new Error('EVM_PRIVATE_KEY or --private-key is required with --execute');
    assertPrivateKey(options.privateKey);
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
      else reject(new Error(`cast send failed with code ${code}: ${stderr || stdout}`));
    });
  });
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseArgs(argv, env);
  if (options.help) {
    console.log(usage());
    return;
  }

  validateExecutionOptions(options);
  const payload = readProofPayload(options.proofPath);
  const plan = createPlan(payload, options);

  if (!options.execute) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const castArgs = buildCastArgs(plan.intent, options);
  const result = await runCast(castArgs);
  console.log(JSON.stringify({
    ok: true,
    receiptId: plan.receiptId,
    rail: plan.rail,
    verifier: plan.verifier,
    signer: plan.signer,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
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
