import { AgentFuelError } from "./errors.js";
import type { AgentFuel } from "./client.js";

// Wire shape of the payment requirement. Servers may send the requirement
// either in an `X-Payment-Required` header (preferred — works with streams)
// or as a JSON body on the 402 response (closer to the official x402 spec).
//
// The parser accepts both `recipient`/`amountUsdc` (the SDK's natural naming)
// and `payTo`/`maxAmountRequired` (closer to the x402 spec) so servers using
// either vocabulary work without configuration.
export type PaymentRequirement = {
  recipient: string;
  amountUsdc: number;
  network?: string;
  resource?: string;
};

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type PaymentRequiredOptions = {
  // Custom fetch implementation (defaults to global). Use this to plug in
  // node-fetch on legacy runtimes or to inject a mock for tests.
  fetch?: FetchLike;
  // Fires after a 402 is parsed, before `spend()` is called. Useful for
  // user-confirmation prompts.
  onPaymentRequired?: (req: PaymentRequirement) => void | Promise<void>;
  // Fires after the on-chain spend lands. Receives the tx signature.
  onPaid?: (signature: string, req: PaymentRequirement) => void | Promise<void>;
};

const HEADER = "X-Payment-Required";
const PAYMENT_HEADER = "X-Payment";

export class PaymentParseError extends AgentFuelError {
  constructor(message: string) {
    super(message);
    this.name = "PaymentParseError";
  }
}

// Returns a fetch-shaped function that transparently handles HTTP 402:
//   1. Call the wrapped fetch.
//   2. If status !== 402, return the response unchanged.
//   3. Otherwise parse the payment requirement, call `fuel.spend()`, then
//      retry the original request with `X-Payment: <signature>` set.
//
// The retry is a single attempt — a second 402 propagates to the caller so a
// misbehaving server can't drain the vault in a loop.
export function paymentRequired(
  fuel: AgentFuel,
  opts: PaymentRequiredOptions = {},
): FetchLike {
  const baseFetch: FetchLike = opts.fetch ?? ((input, init) => fetch(input, init));

  return async (input, init) => {
    const first = await baseFetch(input, init);
    if (first.status !== 402) return first;

    const req = await parseRequirement(first);
    if (opts.onPaymentRequired) await opts.onPaymentRequired(req);

    const { signature } = await fuel.spend({
      service: req.recipient,
      amountUsdc: req.amountUsdc,
    });
    if (opts.onPaid) await opts.onPaid(signature, req);

    const headers = new Headers(init?.headers);
    headers.set(PAYMENT_HEADER, signature);
    return baseFetch(input, { ...init, headers });
  };
}

async function parseRequirement(res: Response): Promise<PaymentRequirement> {
  const header = res.headers.get(HEADER);
  if (header) return parseJson(header);

  let bodyText: string;
  try {
    bodyText = await res.clone().text();
  } catch {
    throw new PaymentParseError(`402 response has no ${HEADER} header and the body is unreadable`);
  }
  if (!bodyText.trim()) {
    throw new PaymentParseError(`402 response has no ${HEADER} header and an empty body`);
  }
  return parseJson(bodyText);
}

function parseJson(text: string): PaymentRequirement {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new PaymentParseError(`payment payload is not valid JSON: ${truncate(text)}`);
  }
  if (typeof obj !== "object" || obj === null) {
    throw new PaymentParseError(`payment payload is not an object`);
  }
  const r = obj as Record<string, unknown>;

  const recipient = stringField(r, "recipient") ?? stringField(r, "payTo");
  if (!recipient) {
    throw new PaymentParseError(`payment payload missing 'recipient' or 'payTo'`);
  }

  const amount =
    numericField(r, "amountUsdc") ?? numericField(r, "maxAmountRequired");
  if (amount === null || amount <= 0) {
    throw new PaymentParseError(
      `payment payload missing positive 'amountUsdc' or 'maxAmountRequired'`,
    );
  }

  const out: PaymentRequirement = { recipient, amountUsdc: amount };
  const network = stringField(r, "network");
  if (network) out.network = network;
  const resource = stringField(r, "resource");
  if (resource) out.resource = resource;
  return out;
}

function stringField(r: Record<string, unknown>, key: string): string | undefined {
  const v = r[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function numericField(r: Record<string, unknown>, key: string): number | null {
  const v = r[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function truncate(s: string): string {
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}
