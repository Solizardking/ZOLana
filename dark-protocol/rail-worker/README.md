# ZOLana Dark Rail Worker

This worker executes the intent-mode side of ZOLana private-payment rail
authorization envelopes. It validates x402/AP2/M2M rail objects exported by Dark
Wallet or the SDK, enforces expiry and replay protection, and returns an
explicit `intent-only` result until a live facilitator or settlement backend is
configured.

## Run

```bash
npm test
npm start
```

The server listens on `127.0.0.1:4020` by default.

```bash
curl -X POST http://127.0.0.1:4020/rail/authorize \
  -H 'content-type: application/json' \
  --data @request.json
```

`request.json`:

```json
{
  "proofPayload": {},
  "railAuthorization": {}
}
```

## What It Enforces

- `proofPayload.domain === "zolana.dark.private-payment"`
- `railAuthorization.domain === "zolana.dark.rail-authorization"`
- rail kind matches `x402-http-402`, `ap2-mandate`, or `m2m-session`
- receipt ID, amount, recipient, commitment, Solana signature, cluster, EVM
  digest, chain ID, and verifier contract match
- EVM intent proof digest recomputes from the EIP-712-style payload
- authorization ID recomputes from the rail envelope
- replay key recomputes from receipt ID, nonce, Solana signature, EVM digest,
  and expiry
- AP2 constraints match amount, recipient, nonce, expiry, and proof
  requirements
- M2M binding digest recomputes from receipt ID, amount, commitment, and EVM
  digest
- authorization has not expired
- replay key is consumed once per process

## Settlement Boundary

This worker is intentionally honest: it does not claim live settlement. The
response includes:

```json
{
  "mode": "intent-only",
  "settlement": {
    "settled": false,
    "reason": "No live x402 facilitator, AP2 mandate runner, or M2M settlement backend configured"
  }
}
```

Add a facilitator adapter behind `processRailRequest` when the production
payment backend is selected.
