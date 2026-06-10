# ZOLana — Build Auxiliary (`build-aux/`)

GNU Autotools build system support files for the Zcash node (zcashd).

## Contents

| Directory | Description |
|-----------|-------------|
| `m4/` | Autoconf macros (M4 macros for feature detection, library checks, compiler flags) |

This directory is used by `configure.ac` and `Makefile.am` at the root level to generate the `configure` script via `autoreconf` / `autogen.sh`.