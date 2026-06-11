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
5. Sign the verifier digest with an EVM intent signer.
6. Submit the signed proof to `ZolanaPrivatePaymentVerifier.recordIntentProof`.

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

First produce the EVM intent signature. This calls the deployed verifier's
`hashIntent` method through `cast call`, then signs the returned raw digest with
`cast wallet sign --no-hash`. Dry-run is the default.

```bash
node scripts/sign-intent-proof.mjs \
  --proof zolana-private-payment-proof.json \
  --contract "$EVM_PRIVATE_PAYMENT_VERIFIER" \
  --rpc-url "$EVM_RPC_URL" \
  --dry-run
```

Sign only when the selected intent signer key is present:

```bash
EVM_INTENT_PRIVATE_KEY=0x...
node scripts/sign-intent-proof.mjs \
  --proof zolana-private-payment-proof.json \
  --contract "$EVM_PRIVATE_PAYMENT_VERIFIER" \
  --rpc-url "$EVM_RPC_URL" \
  --sign
```

The output `signature` becomes `EVM_INTENT_SIGNATURE`. Derive
`EVM_INTENT_SIGNER` from the same key with:

```bash
cast wallet address --private-key "$EVM_INTENT_PRIVATE_KEY"
```

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
- `EVM_INTENT_PRIVATE_KEY` - only needed by `sign-intent-proof.mjs --sign`.
- `EVM_INTENT_SIGNER` - EVM address that signed the EIP-712 intent.
- `EVM_INTENT_SIGNATURE` - 65-byte EVM signature over the verifier digest.
- `SOLANA_VERIFIED_SLOT` - slot verified by the wallet or rail worker.
- `EVM_RPC_URL` and `EVM_PRIVATE_KEY` - only required for `--execute`.

The wallet exports the typed intent payload. The signing and relay scripts keep
EVM private keys outside the Solana paper wallet flow.

## Relay Test

```bash
node --test test/*.test.mjs
node --test test-js/*.test.mjs
```
