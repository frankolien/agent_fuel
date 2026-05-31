import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "idl/reputation": "src/idl/reputation.ts",
    "idl/credit-vault": "src/idl/credit-vault.ts",
    cli: "src/cli.ts",
  },
  format: ["esm", "cjs"],
  // CLI isn't a public type surface — only emit .d.ts for library entries.
  dts: {
    entry: {
      index: "src/index.ts",
      "idl/reputation": "src/idl/reputation.ts",
      "idl/credit-vault": "src/idl/credit-vault.ts",
    },
  },
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  target: "es2022",
  outDir: "dist",
});
