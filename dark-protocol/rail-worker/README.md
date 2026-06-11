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
RAIL_WORKER_STORE_PATH=.zolana/rail-ledger.json
RAIL_WORKER_CORS_ORIGIN=http://127.0.0.1:5173
RAIL_WORKER_VERIFY_SOLANA_ANCHOR=1
RAIL_WORKER_REQUIRE_SOLANA_VERIFICATION=1
RAIL_WORKER_SOLANA_COMMITMENT=confirmed
HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=...
HELIUS_API_KEY=...
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_CLUSTER=devnet
RAIL_WORKER_BACKEND_TOKEN=optional-shared-secret
XAI_API_KEY=
XAI_BASE_URL=https://api.x.ai/v1
XAI_MODEL=grok-4.20-beta-latest-non-reasoning
XAI_TEMPERATURE=0.2
X402_FACILITATOR_URL=https://facilitator.example/authorize
AP2_MANDATE_RUNNER_URL=https://ap2.example/mandates/run
M2M_SETTLEMENT_URL=https://m2m.example/sessions/settle
```

All backend URLs are optional. If a URL is absent for the selected rail, the
worker returns `mode: "intent-only"` and does not claim settlement. If a URL is
present, the worker performs local validation first, then posts the proof,
authorization envelope, and local verification metadata to that backend.

`RAIL_WORKER_STORE_PATH` is optional but recommended. Without it, replay and
settlement state is in memory. With it, the worker writes a local JSON ledger so
replay protection and settlement status survive process restarts. The ledger is
sanitized: it records authorization IDs, receipt IDs, rails, Solana signatures,
EVM digests, and settlement IDs/status, not full proof payloads, recipients, or
amounts.

`RAIL_WORKER_CORS_ORIGIN` defaults to `*`. Set it to the Dark Wallet dev or
production origin when the browser wallet should submit rail authorizations
directly.

`RAIL_WORKER_VERIFY_SOLANA_ANCHOR=1` makes the worker fetch the anchored Solana
transaction and verify the Memo payload before settlement handoff. Use
`RAIL_WORKER_REQUIRE_SOLANA_VERIFICATION=1` in production to reject requests
when RPC verification is unavailable or mismatched. RPC resolution order is:
`HELIUS_RPC_URL`, `SOLANA_RPC_URL`, then `HELIUS_API_KEY` plus `SOLANA_CLUSTER`.

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

Read settlement ledger entries:

```bash
curl http://127.0.0.1:4020/rail/settlements
curl http://127.0.0.1:4020/rail/settlements/rail_x402_...
```

## Dark Clawd Agent Planning

`POST /agent/rail-plan` returns a public-only rail plan for Dark Wallet before a
receipt is staged or submitted. This endpoint does not consume replay keys,
write settlement ledger entries, or claim settlement. It exists to keep
`XAI_API_KEY` server-side when the browser wallet asks Dark Clawd for x402/AP2/M2M
policy guidance.

If `XAI_API_KEY` is absent, the endpoint returns deterministic local guardrails.
If `XAI_API_KEY` is present, it sends a sanitized prompt to xAI and includes the
model review in the response. The prompt contains amount, selected rail,
settlement, proof layer, durable-receipt flag, Helius/EVM/rail-worker readiness,
Solana anchor status, recipient fingerprint, memo fingerprint, and prompt
digest. It does not include seed phrases, paper-wallet secret-key JSON,
plaintext private memos, backend tokens, or API keys.

```bash
curl -X POST http://127.0.0.1:4020/agent/rail-plan \
  -H 'content-type: application/json' \
  --data '{
    "context": {
      "network": "devnet",
      "amountSol": 0.25,
      "recipientFingerprint": "zsol...iver#1234",
      "rail": "x402",
      "settlement": "solana",
      "proofLayer": "evm",
      "durableReceipt": true,
      "hasSolanaAnchor": false,
      "solanaAnchorVerified": false
    }
  }'
```

The endpoint can also derive a sanitized context from an exported wallet
`proofPayload` plus `railAuthorization`. In that mode it fingerprints the
recipient and memo hash before planning.

## EVM Verifier Handoff

Accepted `/rail/authorize` responses include `evmVerifierPlan` when EVM proofing
is required or configured. The plan is created only after local validation and
Solana Memo verification succeed. It includes verifier address, EVM chain ID,
intent digest, verified Solana slot, Solana signature, proof-file placeholder,
and dry-run-first command lines for:

- `dark-protocol/evm-verifier/scripts/sign-intent-proof.mjs`
- `dark-protocol/evm-verifier/scripts/submit-intent-proof.mjs`

The handoff does not store full proof payloads, recipients, amounts, private
keys, or EVM signatures in the rail ledger. Durable ledger entries store only
sanitized readiness fields such as `evmVerifierReady`,
`evmVerifierStatus`, `evmVerifierPlanDigest`, and
`evmVerifierSolanaSlot`.

Backends configured through `X402_FACILITATOR_URL`, `AP2_MANDATE_RUNNER_URL`,
or `M2M_SETTLEMENT_URL` receive the same sanitized `evmVerifierPlan` inside
`localVerification`, so a live facilitator can queue EVM intent proofing without
recomputing wallet internals.

## What It Enforces

- `proofPayload.domain === "zolana.dark.private-payment"`
- `railAuthorization.domain === "zolana.dark.rail-authorization"`
- rail kind matches `x402-http-402`, `ap2-mandate`, or `m2m-session`
- receipt ID, amount, recipient, commitment, Solana signature, cluster, EVM
  digest, chain ID, and verifier contract match
- optional or required Solana RPC verification proves the anchored Memo
  transaction contains a matching `zolana.dark` private-payment intent
- EVM intent proof digest recomputes from the EIP-712-style payload
- authorization ID recomputes from the rail envelope
- replay key recomputes from receipt ID, nonce, Solana signature, EVM digest,
  and expiry
- AP2 constraints match amount, recipient, nonce, expiry, and proof
  requirements
- M2M binding digest recomputes from receipt ID, amount, commitment, and EVM
  digest
- authorization has not expired
- replay key is consumed once per worker state, or durably when
  `RAIL_WORKER_STORE_PATH` is configured

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

Accepted `intent-only` and backend-mode responses include a `ledger` field:

```json
{
  "ledger": {
    "durable": true,
    "recorded": true,
    "authorizationId": "rail_ap2_..."
  }
}
```
