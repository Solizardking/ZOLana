# Jupiter Swap API Example

ZOLana note: this example directory is kept as reference only and is not part
of the supported public release surface. Dependency manifests are stripped in
this branch to keep public dependency scanning focused on maintained product
packages.

Dependency-free quote/order example for Jupiter Swap API v2.

This sample does not read or sign with a private key. It requests an order from
Jupiter and prints a compact summary. If `TAKER_PUBLIC_KEY` is omitted, Jupiter
returns a quote without an assembled transaction.

## Environment

```sh
JUPITER_API_KEY=<api key>
INPUT_MINT_ADDRESS=So11111111111111111111111111111111111111112
OUTPUT_MINT_ADDRESS=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
AMOUNT=100000000
TAKER_PUBLIC_KEY=<optional wallet public key>
```

## Run

```sh
npm run check
npm run start
```
