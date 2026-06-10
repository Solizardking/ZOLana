# ZOLana — Core Source (`src/`)

This directory contains the full C++ full-node source code for the Zcash blockchain daemon (`zcashd`), which serves as the privacy-focused base layer for the ZOLana ecosystem.

## Structure

| Component | Description |
|-----------|-------------|
| `*.cpp` / `*.h` | Core Zcash node: consensus, networking, mempool, wallet, RPC |
| `rust/` | Rust FFI library (`librustzcash`) for Zcash privacy primitives (Sapling, Orchard, ZK proofs) |
| `consensus/` | Consensus rule engine (Zcash protocol parameters) |
| `crypto/` | Cryptographic primitives (hash functions, key derivation) |
| `leveldb/` | Embedded LevelDB for chain state storage |
| `bench/` | Benchmarking framework |
| `pow/` | Equihash proof-of-work engine |
| `compat/` | OS compatibility shims |
| `crc32c/` | CRC32C checksum implementation |

## Key Files

- `zcashd.cpp` — Main daemon entrypoint
- `main.cpp` — Core blockchain processing logic
- `init.cpp` — Initialization and parameter loading
- `rpcserver.cpp` — JSON-RPC API server
- `wallet/wallet.cpp` — Zcash wallet implementation with shielded address support

## Building

See the root-level `INSTALL` and `depends/README.md` for build instructions.

## Integration

The Zcash node provides the privacy infrastructure for ZOLana's shielded transactions, zero-knowledge proof generation/verification, and private wallet functionality.