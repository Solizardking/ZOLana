# ZOLana Dark Rail Worker

This worker executes the ZOLana private-payment rail authorization envelopes.
It validates x402/AP2/M2M rail objects exported by Dark Wallet or the SDK,
enforces expiry and replay protection, and either:

- returns an explicit `intent-only` result when no backend is configured
- forwards the validated envelope to a configured x402 facilitator, AP2 mandate
  runner, or M2M settlement backend

## Run

```bash
npm test
npm start
```

The server listens on `127.0.0.1:4020` by default.

## Environment

```bash
RAIL_WORKER_PORT=4020
RAIL_WORKER_BACKEND_TOKEN=optional-shared-secret
X402_FACILITATOR_URL=https://facilitator.example/authorize
AP2_MANDATE_RUNNER_URL=https://ap2.example/mandates/run
M2M_SETTLEMENT_URL=https://m2m.example/sessions/settle
```

All backend URLs are optional. If a URL is absent for the selected rail, the
worker returns `mode: "intent-only"` and does not claim settlement. If a URL is
present, the worker performs local validation first, then posts the proof,
authorization envelope, and local verification metadata to that backend.

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

## Settlement Modes

Without backend URLs, the response is intentionally honest:

```json
{
  "mode": "intent-only",
  "settlement": {
    "settled": false,
    "reason": "No live x402 facilitator, AP2 mandate runner, or M2M settlement backend configured"
  }
}
```

With a backend URL configured for the rail, the response becomes:

```json
{
  "mode": "backend",
  "settlement": {
    "settled": false,
    "status": "pending",
    "backendUrl": "https://ap2.example/mandates/run",
    "settlementId": "set_001",
    "transactionId": "tx_001"
  }
}
```

The backend must return JSON. The worker treats `settlementStatus: "settled"` or
`settled: true` as settled; otherwise accepted responses are normalized to
pending settlement. Backend rejection or outage returns `502` and does not
consume the replay key, so the same durable rail authorization can be retried.
