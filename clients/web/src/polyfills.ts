// Browser polyfills for Node built-ins that Solana libs reach for at
// module-evaluation time. Must be the first import in main.tsx so the
// globals are set before any spl-token / anchor / wallet-adapter code runs.

import { Buffer } from "buffer";

if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}
