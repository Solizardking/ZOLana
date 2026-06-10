import { createHash } from 'node:crypto';

const TYPE = 'PrivatePaymentIntent(string receiptId,string rail,string settlement,string proofLayer,bool durableReceipt,string recipient,string amountLamports,string commitmentHex,string nonce,string memoHash,string solanaSignature,string solanaCluster,string createdAt)';
const DOMAIN = {
  name: 'ZOLana Dark Private Payment',
  version: '1',
};

function sha3Fallback(value) {
  // Node core does not expose keccak256. This fallback is for deterministic
  // fixture IDs only; contract verification uses native keccak256.
  return `0x${createHash('sha256').update(value).digest('hex')}`;
}

export function createVerifierIntentFromProofPayload(payload) {
  const proof = payload.evmIntentProof?.eip712?.message;
  if (!proof) {
    throw new Error('Proof payload is missing evmIntentProof.eip712.message');
  }

  return {
    receiptId: proof.receiptId,
    rail: proof.rail,
    settlement: proof.settlement,
    proofLayer: proof.proofLayer,
    durableReceipt: proof.durableReceipt,
    recipient: proof.recipient,
    amountLamports: proof.amountLamports,
    commitmentHex: proof.commitmentHex,
    nonce: proof.nonce,
    memoHash: proof.memoHash || '0x',
    solanaSignature: proof.solanaSignature,
    solanaCluster: proof.solanaCluster,
    createdAt: proof.createdAt,
  };
}

export function createReferenceDigest(payload) {
  const intent = createVerifierIntentFromProofPayload(payload);
  return {
    domain: DOMAIN,
    type: TYPE,
    digest: sha3Fallback(JSON.stringify({ domain: DOMAIN, intent })),
    intent,
    note: 'Digest uses sha256 fallback for local fixture IDs. The Solidity verifier computes EIP-712 with keccak256.',
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  console.log(JSON.stringify(createReferenceDigest(payload), null, 2));
}

