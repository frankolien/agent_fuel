export class AgentFuelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentFuelError";
  }
}

// Thrown when a method needs the vault owner but neither the constructor nor
// the call site supplied one. The fix is to pass `owner` to `new AgentFuel`
// or to the method itself.
export class OwnerNotConfiguredError extends AgentFuelError {
  constructor() {
    super("vault owner is not configured: pass `owner` to `new AgentFuel({...})` or to the method");
    this.name = "OwnerNotConfiguredError";
  }
}

export class AccountNotFoundError extends AgentFuelError {
  readonly account: string;
  constructor(account: string) {
    super(`account not found: ${account}`);
    this.name = "AccountNotFoundError";
    this.account = account;
  }
}

export class HttpError extends AgentFuelError {
  readonly status: number;
  readonly url: string;
  readonly body: string | undefined;
  constructor(status: number, url: string, body?: string) {
    super(`HTTP ${status} from ${url}`);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

// Local spend guardrails — mirror `check_and_record_spend` in
// programs/credit_vault/src/policy.rs. Thrown before the SDK constructs the
// on-chain `spend` instruction so callers see a typed error instead of an
// opaque simulation failure.

export class SpendPolicyError extends AgentFuelError {
  constructor(message: string) {
    super(message);
    this.name = "SpendPolicyError";
  }
}

export class VaultFrozenError extends SpendPolicyError {
  constructor() {
    super("vault is frozen");
    this.name = "VaultFrozenError";
  }
}

export class ZeroAmountError extends SpendPolicyError {
  constructor() {
    super("amount must be > 0");
    this.name = "ZeroAmountError";
  }
}

export class PerTxLimitExceededError extends SpendPolicyError {
  readonly limit: number;
  readonly amount: number;
  constructor(amount: number, limit: number) {
    super(`per-tx limit exceeded: ${amount} > ${limit}`);
    this.name = "PerTxLimitExceededError";
    this.amount = amount;
    this.limit = limit;
  }
}

export class HourlyLimitExceededError extends SpendPolicyError {
  readonly limit: number;
  readonly windowSpent: number;
  readonly amount: number;
  constructor(amount: number, windowSpent: number, limit: number) {
    super(`hourly limit exceeded: ${windowSpent} + ${amount} > ${limit}`);
    this.name = "HourlyLimitExceededError";
    this.amount = amount;
    this.windowSpent = windowSpent;
    this.limit = limit;
  }
}

export class LifetimeLimitExceededError extends SpendPolicyError {
  readonly limit: number;
  readonly totalSpent: number;
  readonly amount: number;
  constructor(amount: number, totalSpent: number, limit: number) {
    super(`lifetime limit exceeded: ${totalSpent} + ${amount} > ${limit}`);
    this.name = "LifetimeLimitExceededError";
    this.amount = amount;
    this.totalSpent = totalSpent;
    this.limit = limit;
  }
}

export class NotWhitelistedError extends SpendPolicyError {
  readonly service: string;
  constructor(service: string) {
    super(`service ${service} is not in the vault's whitelist`);
    this.name = "NotWhitelistedError";
    this.service = service;
  }
}
