export class AgentFuelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentFuelError";
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
