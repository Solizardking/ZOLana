# ZOLana EVM Private Payment Verifier

This package is the EVM-side verifier artifact for ZOLana private-payment
intent proofs. It accepts exported wallet proof payloads after the Solana Memo
anchor has been verified and records a consume-once EIP-712 proof digest.

## What It Verifies

- The receipt is durable, not ephemeral.
- The rail is one of `x402`, `ap2`, or `m2m`.
- The payload is bound to a Solana Memo signature and cluster.
- The signer authorized the EIP-712 `PrivatePaymentIntent`.
- Each digest can be consumed only once to reduce replay risk.

The contract does not settle funds. It is the verifier/anchor side for the
wallet receipt primitive while the x402 facilitator, AP2 mandate execution, M2M
settlement, and Dark Protocol proof programs are wired.

## Build And Test

```bash
forge build
forge test
```

## Flow

1. Stage a private payment in Dark Wallet.
2. Anchor it on Solana as a Memo intent.
3. Click `Verify Anchor` in the wallet so the receipt stores verified Solana
   slot, payer, and Memo-match metadata.
4. Export the proof payload.
5. Convert or submit `evmIntentProof.eip712.message` to
   `ZolanaPrivatePaymentVerifier.recordIntentProof`.

## Contract

`src/ZolanaPrivatePaymentVerifier.sol` exposes:

- `hashIntent(intent)` - returns the EIP-712 digest.
- `verifyIntent(intent, signer, signature)` - validates the signer.
- `recordIntentProof(intent, signer, signature, solanaSlot)` - verifies and
  consumes the digest, emitting `PrivatePaymentIntentVerified`.

## Local Reference Encoder

```bash
node scripts/intent-proof.mjs < zolana-private-payment-proof.json
```

The script emits a deterministic local fixture digest and the Solidity-ready
intent object. Contract verification uses Solidity `keccak256` and the EIP-712
domain separator, so the script digest is only a fixture aid, not a replacement
for contract verification.

