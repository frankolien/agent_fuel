#!/usr/bin/env node
// Copies IDLs from target/idl/ into src/idl/. Run before publish so a released
// SDK pins the exact ABI it was tested against, independent of `anchor build`
// running in SDK CI.

import { copyFile, mkdir, access } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const targetIdl = resolve(repoRoot, "target/idl");
const dstDir = resolve(__dirname, "../src/idl");

const files = [
  ["reputation.json", "reputation.json"],
  ["credit_vault.json", "credit-vault.json"],
];

await mkdir(dstDir, { recursive: true });

for (const [src, dst] of files) {
  const from = resolve(targetIdl, src);
  try {
    await access(from);
  } catch {
    console.error(
      `vendor-idl: missing ${from}. Run \`anchor build\` at the repo root first.`,
    );
    process.exit(1);
  }
  await copyFile(from, resolve(dstDir, dst));
  console.warn(`vendor-idl: ${src} → src/idl/${dst}`);
}
