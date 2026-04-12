#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRATE_DIR="$ROOT_DIR/rust/qq_racer_engine"
OUT_DIR="$ROOT_DIR/src/engine/wasm/pkg"

mkdir -p "$OUT_DIR"

cargo build \
  --manifest-path "$CRATE_DIR/Cargo.toml" \
  --release \
  --target wasm32-unknown-unknown \
  --features wasm

wasm-bindgen \
  "$CRATE_DIR/target/wasm32-unknown-unknown/release/qq_racer_engine.wasm" \
  --out-dir "$OUT_DIR" \
  --target web \
  --typescript

echo "WASM package generated at $OUT_DIR"
