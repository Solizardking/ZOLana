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

## Submit Proof To Verifier

`scripts/submit-intent-proof.mjs` turns a wallet-exported proof payload into a
Foundry `cast send` call for `recordIntentProof`. Dry-run is the default and
prints the redacted command plan without broadcasting.

```bash
node scripts/submit-intent-proof.mjs \
  --proof zolana-private-payment-proof.json \
  --contract "$EVM_PRIVATE_PAYMENT_VERIFIER" \
  --signer "$EVM_INTENT_SIGNER" \
  --signature "$EVM_INTENT_SIGNATURE" \
  --solana-slot "$SOLANA_VERIFIED_SLOT" \
  --dry-run
```

Broadcast only when the EVM RPC and relayer private key are configured:

```bash
EVM_RPC_URL=https://...
EVM_PRIVATE_KEY=0x...
node scripts/submit-intent-proof.mjs \
  --proof zolana-private-payment-proof.json \
  --contract "$EVM_PRIVATE_PAYMENT_VERIFIER" \
  --signer "$EVM_INTENT_SIGNER" \
  --signature "$EVM_INTENT_SIGNATURE" \
  --solana-slot "$SOLANA_VERIFIED_SLOT" \
  --execute
```

Required values:

- `EVM_PRIVATE_PAYMENT_VERIFIER` - deployed verifier contract address.
- `EVM_INTENT_SIGNER` - EVM address that signed the EIP-712 intent.
- `EVM_INTENT_SIGNATURE` - 65-byte EVM signature over the verifier digest.
- `SOLANA_VERIFIED_SLOT` - slot verified by the wallet or rail worker.
- `EVM_RPC_URL` and `EVM_PRIVATE_KEY` - only required for `--execute`.

The wallet currently exports the typed intent payload. The EVM signature must be
created by the selected EVM signer or relayer policy before this script can
broadcast. This keeps the Solana paper wallet from holding EVM private keys.

## Relay Test

```bash
node --test test/*.test.mjs
```
