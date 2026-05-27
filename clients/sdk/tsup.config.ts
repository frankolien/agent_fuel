import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "idl/reputation": "src/idl/reputation.ts",
    "idl/credit-vault": "src/idl/credit-vault.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  target: "es2022",
  outDir: "dist",
});
