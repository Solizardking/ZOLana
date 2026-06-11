## ZecPaperWallet Web

The legacy `paper/web/www` browser build is archived and is not part of the
supported public release surface.

Reason:

- the old webpack/bootstrap sample is illustrative only
- its npm dependency tree currently resolves to multiple high-severity
  advisories
- the offline CLI and native paper-wallet flows are the supported paths for
  serious key generation

If you need a paper wallet for real funds, use the offline tooling under
[`paper/`](../README.md) on an air-gapped machine.
