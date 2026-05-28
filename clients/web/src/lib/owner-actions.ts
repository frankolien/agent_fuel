// Owner-side write actions against the credit_vault program.
//
// The SDK's six functions are agent-side reads + spend(). Owner actions
// (deposit, updatePolicy, freeze) need the connected wallet to sign — they
// live here so the SDK can stay browser-agnostic for now.

import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import bs58 from "bs58";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  getMint,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type TransactionInstruction,
  type TransactionSignature,
} from "@solana/web3.js";
// The SDK's published browser bundle pulls in anchor's NodeWallet at the top
// level, which doesn't exist in the browser anchor bundle. Until the SDK is
// republished without that import, the web client reads the IDL JSON directly
// and inlines the PDA helpers it needs.
import creditVaultIdl from "../../../sdk/src/idl/credit-vault.json";
import reputationIdl from "../../../sdk/src/idl/reputation.json";
import type { Agent, Service, Vault } from "@/types/api";

const CREDIT_VAULT_PROGRAM_ID = new PublicKey(creditVaultIdl.address);
const REPUTATION_PROGRAM_ID = new PublicKey(reputationIdl.address);

function vaultPda(owner: PublicKey, agent: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), owner.toBuffer(), agent.toBuffer()],
    CREDIT_VAULT_PROGRAM_ID,
  );
  return pda;
}

function policyPda(vault: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), vault.toBuffer()],
    CREDIT_VAULT_PROGRAM_ID,
  );
  return pda;
}

function agentProfilePda(agent: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("agent"), agent.toBuffer()],
    REPUTATION_PROGRAM_ID,
  );
  return pda;
}

function serviceRegistryPda(service: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("service"), service.toBuffer()],
    REPUTATION_PROGRAM_ID,
  );
  return pda;
}

/** What we need from the wallet adapter to sign + submit on the user's behalf. */
type Wallet = {
  publicKey: PublicKey;
  signTransaction<T extends Transaction>(tx: T): Promise<T>;
};

type DepositArgs = {
  connection: Connection;
  wallet: Wallet;
  owner: PublicKey;
  agent: PublicKey;
  mint: PublicKey;
  amountUsdcMicro: number;
};

export async function deposit(args: DepositArgs): Promise<TransactionSignature> {
  const { connection, wallet, owner, agent, mint, amountUsdcMicro } = args;
  if (amountUsdcMicro <= 0) throw new Error("amount must be positive");

  const vault = vaultPda(owner, agent);
  const ownerAta = await getAssociatedTokenAddress(mint, owner);
  const vaultAta = await getAssociatedTokenAddress(mint, vault, true);
  const program = buildProgram(connection, wallet);

  const ix = await program.methods
    .deposit(new BN(amountUsdcMicro))
    .accounts({
      owner,
      vault,
      ownerTokenAccount: ownerAta,
      vaultTokenAccount: vaultAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  return sendOne(connection, wallet, ix);
}

type UpdatePolicyArgs = {
  connection: Connection;
  wallet: Wallet;
  owner: PublicKey;
  agent: PublicKey;
  /** Micro-USDC. Omit to leave that cap unchanged. */
  perTxUsdcMicro?: number;
  hourlyUsdcMicro?: number;
  lifetimeUsdcMicro?: number;
  /** Omit to leave unchanged. */
  allowPostPay?: boolean;
  /** Up to 8 service pubkeys; positions beyond `whitelist.length` are zero-filled. */
  whitelist?: PublicKey[];
};

export type PolicyCaps = {
  perTxUsdcMicro: number;
  hourlyUsdcMicro: number;
  lifetimeUsdcMicro: number;
};

export async function readPolicyCaps(args: {
  connection: Connection;
  owner: PublicKey;
  agent: PublicKey;
}): Promise<PolicyCaps> {
  const program = buildProgram(args.connection, readOnlyWallet(args.owner));
  const policy = policyPda(vaultPda(args.owner, args.agent));
  const acc = await program.account.spendPolicy.fetch(policy);
  return {
    perTxUsdcMicro: Number(acc.perTxLimitUsdc),
    hourlyUsdcMicro: Number(acc.hourlyLimitUsdc),
    lifetimeUsdcMicro: Number(acc.lifetimeLimitUsdc),
  };
}

// Loose-typed reputation program. Same pattern as credit_vault's LooseProgram.
type LooseReputationProgram = {
  methods: {
    initializeAgent: (
      agentUri: number[],
      externalAgentId: BN,
    ) => {
      accounts: (a: Record<string, PublicKey>) => {
        instruction: () => Promise<TransactionInstruction>;
      };
    };
    registerService: (
      name: number[],
      category: Record<string, Record<string, never>>,
      serviceUri: number[],
    ) => {
      accounts: (a: Record<string, PublicKey>) => {
        instruction: () => Promise<TransactionInstruction>;
      };
    };
    setServiceActive: (active: boolean) => {
      accounts: (a: Record<string, PublicKey>) => {
        instruction: () => Promise<TransactionInstruction>;
      };
    };
  };
  account: {
    agentProfile: { fetchNullable: (pk: PublicKey) => Promise<unknown | null> };
    serviceRegistry: {
      all: () => Promise<Array<{ publicKey: PublicKey; account: unknown }>>;
      fetchNullable: (pk: PublicKey) => Promise<unknown | null>;
    };
  };
};

function buildReputationProgram(connection: Connection, wallet: Wallet): LooseReputationProgram {
  const provider = new AnchorProvider(
    connection,
    {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction.bind(wallet),
      signAllTransactions: (txs: Transaction[]) =>
        Promise.all(txs.map((t) => wallet.signTransaction(t))),
    } as unknown as AnchorProvider["wallet"],
    AnchorProvider.defaultOptions(),
  );
  return new Program(reputationIdl, provider) as unknown as LooseReputationProgram;
}

/** Pad a string into a fixed-size byte array, truncating UTF-8 to fit. */
function bytesPadded(text: string, size: number): number[] {
  const buf = new Uint8Array(size);
  const enc = new TextEncoder().encode(text);
  buf.set(enc.subarray(0, size));
  return Array.from(buf);
}

export type ServiceCategory = "DataFeed" | "Compute" | "Swap" | "Rpc" | "Other";

function categoryEnum(c: ServiceCategory): Record<string, Record<string, never>> {
  // Anchor enums are encoded as { camelCaseVariant: {} } on the JS side.
  const key = c.charAt(0).toLowerCase() + c.slice(1);
  return { [key]: {} };
}

export async function initializeAgent(args: {
  connection: Connection;
  wallet: Wallet;
  /**
   * When set, the agent identity is a separate keypair from the owner wallet.
   * Both sign the init tx. When omitted, owner == agent (solo setup).
   */
  agentKeypair?: Keypair;
  /** Stored on-chain as a 128-byte blob; truncated UTF-8 if longer. */
  agentUri?: string;
  externalAgentId?: number;
}): Promise<TransactionSignature> {
  const { connection, wallet, agentKeypair } = args;
  const agent = agentKeypair?.publicKey ?? wallet.publicKey;
  const uri = args.agentUri ?? `https://agentfuel.online/agents/${agent.toBase58()}`;
  const program = buildReputationProgram(connection, wallet);
  const profile = agentProfilePda(agent);

  // Idempotent: skip if profile already exists. Caller catches as a no-op.
  const existing = await program.account.agentProfile.fetchNullable(profile);
  if (existing) throw new AgentAlreadyInitializedError(profile.toBase58());

  const ix = await program.methods
    .initializeAgent(bytesPadded(uri, 128), new BN(args.externalAgentId ?? 0))
    .accounts({
      owner: wallet.publicKey,
      agent,
      agentProfile: profile,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return sendWithSigners(connection, wallet, [ix], agentKeypair ? [agentKeypair] : []);
}

export class AgentAlreadyInitializedError extends Error {
  constructor(public readonly profile: string) {
    super(`agent profile already exists at ${profile}`);
    this.name = "AgentAlreadyInitializedError";
  }
}

export async function registerService(args: {
  connection: Connection;
  /** Sponsor wallet (Phantom). Pays rent and submits the tx. */
  wallet: Wallet;
  /**
   * The service identity keypair — separate from the sponsor wallet. Partial-signs
   * the tx so it can't be front-run, but the sponsor pays rent so the service
   * never needs to hold SOL. Pattern mirrors `createVault({ agentKeypair })`.
   */
  serviceKeypair: Keypair;
  name: string;
  category: ServiceCategory;
  /** Off-chain metadata URL (pricing, docs, endpoint). Padded to 128 bytes. */
  serviceUri?: string;
}): Promise<{ signature: TransactionSignature; registry: PublicKey }> {
  const { connection, wallet, serviceKeypair, name, category, serviceUri = "" } = args;
  if (name.length === 0) throw new Error("service name is required");
  const program = buildReputationProgram(connection, wallet);
  const registry = serviceRegistryPda(serviceKeypair.publicKey);

  const ix = await program.methods
    .registerService(bytesPadded(name, 32), categoryEnum(category), bytesPadded(serviceUri, 128))
    .accounts({
      sponsor: wallet.publicKey,
      service: serviceKeypair.publicKey,
      serviceRegistry: registry,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  const signature = await sendWithSigners(connection, wallet, [ix], [serviceKeypair]);
  return { signature, registry };
}

/**
 * Pause or resume a service. The service authority (keypair downloaded at
 * registration time) signs alone — the wallet only relays the tx via the user's
 * sponsor flow if they happen to also be the authority (rare).
 */
export async function setServiceActive(args: {
  connection: Connection;
  wallet: Wallet;
  serviceKeypair: Keypair;
  active: boolean;
}): Promise<TransactionSignature> {
  const { connection, wallet, serviceKeypair, active } = args;
  const program = buildReputationProgram(connection, wallet);
  const registry = serviceRegistryPda(serviceKeypair.publicKey);
  const ix = await program.methods
    .setServiceActive(active)
    .accounts({
      service: serviceKeypair.publicKey,
      serviceRegistry: registry,
      authority: serviceKeypair.publicKey,
    })
    .instruction();
  return sendWithSigners(connection, wallet, [ix], [serviceKeypair]);
}

type CreateVaultArgs = {
  connection: Connection;
  wallet: Wallet;
  /**
   * When set, the vault's agent is a separate keypair from the owner wallet.
   * The keypair signs the create_vault tx alongside the owner. Omit for the
   * owner == agent solo setup.
   */
  agentKeypair?: Keypair;
  /**
   * Use an *existing* agent profile (already on chain) as the vault's agent.
   * Mutually exclusive with `agentKeypair`. No signature needed because
   * `create_vault` only uses `agent` as a PDA seed, not as a signer, and we
   * skip the `initialize_agent` step when the profile already exists.
   */
  agentPubkey?: PublicKey;
  mint: PublicKey;
  perTxUsdcMicro: number;
  hourlyUsdcMicro: number;
  lifetimeUsdcMicro: number;
  allowPostPay: boolean;
};

export async function createVault(
  args: CreateVaultArgs,
): Promise<{ signature: TransactionSignature; vault: PublicKey; agentInitialized: boolean }> {
  const {
    connection,
    wallet,
    agentKeypair,
    agentPubkey,
    mint,
    perTxUsdcMicro,
    hourlyUsdcMicro,
    lifetimeUsdcMicro,
    allowPostPay,
  } = args;
  const owner = wallet.publicKey;
  const agent = agentKeypair?.publicKey ?? agentPubkey ?? owner;

  const vault = vaultPda(owner, agent);
  const policy = policyPda(vault);
  const vaultAta = await getAssociatedTokenAddress(mint, vault, true);
  const program = buildProgram(connection, wallet);

  // Bundle initialize_agent into the same transaction when the reputation
  // profile doesn't exist yet — matches what the CLI bootstrap does and
  // means "create vault" gives the user a fully-set-up agent in one click.
  const reputation = buildReputationProgram(connection, wallet);
  const profile = agentProfilePda(agent);
  const existing = await reputation.account.agentProfile.fetchNullable(profile);
  const agentInitialized = !existing;

  // Safety: if the agent profile doesn't exist yet, we MUST initialize it,
  // which needs the agent to sign. If the caller only provided a pubkey for
  // an existing-agent flow, fail early instead of producing an invalid tx.
  if (agentInitialized && !agentKeypair) {
    if (agentPubkey) {
      throw new Error(
        "Agent profile not found on chain — cannot create a vault for a non-existent agent without its keypair.",
      );
    }
  }

  const ixs: TransactionInstruction[] = [];
  if (agentInitialized) {
    const uri = `https://agentfuel.online/agents/${agent.toBase58()}`;
    const initIx = await reputation.methods
      .initializeAgent(bytesPadded(uri, 128), new BN(0))
      .accounts({
        owner,
        agent,
        agentProfile: profile,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    ixs.push(initIx);
  }

  const createIx = await program.methods
    .createVault(
      new BN(perTxUsdcMicro),
      new BN(hourlyUsdcMicro),
      new BN(lifetimeUsdcMicro),
      allowPostPay,
    )
    .accounts({
      owner,
      agent,
      usdcMint: mint,
      vault,
      policy,
      vaultTokenAccount: vaultAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  ixs.push(createIx);

  const signature = await sendWithSigners(
    connection,
    wallet,
    ixs,
    agentKeypair ? [agentKeypair] : [],
  );
  return { signature, vault, agentInitialized };
}

/**
 * Devnet-only: mint test-USDC to the connected wallet's ATA. Only works when
 * the wallet IS the mint's authority — which is the case for the test mint
 * `devnet:bootstrap` deploys, where owner == mint authority.
 */
export async function mintTestUsdc(args: {
  connection: Connection;
  wallet: Wallet;
  mint: PublicKey;
  amountUsdcMicro: number;
}): Promise<TransactionSignature> {
  const { connection, wallet, mint, amountUsdcMicro } = args;
  const ata = await getAssociatedTokenAddress(mint, wallet.publicKey);
  // Idempotent ATA-create (no-op if already exists) + mintTo, batched.
  const ixs = [
    createAssociatedTokenAccountIdempotentInstruction(
      wallet.publicKey,
      ata,
      wallet.publicKey,
      mint,
    ),
    createMintToInstruction(mint, ata, wallet.publicKey, BigInt(amountUsdcMicro)),
  ];
  return sendOne(connection, wallet, ...ixs);
}

/** True when the connected wallet matches the mint's `mintAuthority`. */
export async function isMintAuthority(
  connection: Connection,
  wallet: PublicKey,
  mint: PublicKey,
): Promise<boolean> {
  try {
    const info = await getMint(connection, mint);
    return info.mintAuthority?.equals(wallet) ?? false;
  } catch {
    return false;
  }
}

type FreezeArgs = {
  connection: Connection;
  wallet: Wallet;
  owner: PublicKey;
  agent: PublicKey;
};

export async function setFrozen(
  args: FreezeArgs & { frozen: boolean },
): Promise<TransactionSignature> {
  const { connection, wallet, owner, agent, frozen } = args;
  const vault = vaultPda(owner, agent);
  const program = buildProgram(connection, wallet);
  const builder = frozen ? program.methods.freezeVault() : program.methods.unfreezeVault();
  const ix = await builder.accounts({ owner, vault }).instruction();
  return sendOne(connection, wallet, ix);
}

/**
 * On-chain whitelist is a fixed-size `[Pubkey; 8]`. The program treats
 * `Pubkey::default()` (all zeros) as an empty slot, so pad the trailing
 * positions with the system-program ID, which is the all-zeros pubkey.
 */
function padWhitelist(entries: PublicKey[], size: number): PublicKey[] {
  const out = entries.slice(0, size);
  while (out.length < size) out.push(PublicKey.default);
  return out;
}

export async function updatePolicy(args: UpdatePolicyArgs): Promise<TransactionSignature> {
  const { connection, wallet, owner, agent } = args;
  const vault = vaultPda(owner, agent);
  const policy = policyPda(vault);
  const program = buildProgram(connection, wallet);

  // Read current values so we can preserve whitelist + allowPostPay and
  // default-leave any caps the caller didn't override.
  const current = await program.account.spendPolicy.fetch(policy);
  const newPerTx = args.perTxUsdcMicro ?? Number(current.perTxLimitUsdc);
  const newHourly = args.hourlyUsdcMicro ?? Number(current.hourlyLimitUsdc);
  const newLifetime = args.lifetimeUsdcMicro ?? Number(current.lifetimeLimitUsdc);
  const newAllowPostPay = args.allowPostPay ?? current.allowPostPay;
  const newWhitelist = padWhitelist(args.whitelist ?? current.whitelist, 8);

  const ix = await program.methods
    .updatePolicy(
      new BN(newPerTx),
      new BN(newHourly),
      new BN(newLifetime),
      newAllowPostPay,
      newWhitelist,
    )
    .accounts({
      owner,
      vault,
      policy,
    })
    .instruction();

  return sendOne(connection, wallet, ix);
}

// ---- read-only chain fallback ----


/**
 * Read a vault directly from the chain when the backend indexer doesn't know
 * about it yet. Maps the on-chain CreditVault + SpendPolicy + token-account
 * balance into the same `Vault` shape the REST endpoint returns, so the UI
 * doesn't need to branch on origin.
 */
export async function readVaultFromChain(
  connection: Connection,
  vaultPubkey: PublicKey,
): Promise<Vault | null> {
  // We don't have a wallet for read-only; the program builder accepts any
  // pubkey since we never sign.
  const program = buildProgram(connection, readOnlyWallet(vaultPubkey));

  const vault = await program.account.creditVault.fetchNullable(vaultPubkey);
  if (!vault) return null;
  const policy = await program.account.spendPolicy.fetch(policyPda(vaultPubkey));
  return composeVault(vaultPubkey, vault, policy);
}

/**
 * Discover all vaults whose `owner` field matches the given pubkey, directly
 * from the chain. Filters via getProgramAccounts memcmp at the owner offset.
 *
 * Layout: 8-byte Anchor discriminator + owner(32) + agent(32) + ...
 * So owner sits at byte offset 8.
 */
export async function readVaultsFromChainByOwner(
  connection: Connection,
  owner: PublicKey,
): Promise<Vault[]> {
  const accounts = await connection.getProgramAccounts(CREDIT_VAULT_PROGRAM_ID, {
    filters: [{ memcmp: { offset: 8, bytes: owner.toBase58() } }],
  });

  // For each vault, hydrate the (vault + policy) in parallel. N+1 round-trips
  // but typical users have 1-3 vaults — fine. Would want batching at scale.
  const program = buildProgram(connection, readOnlyWallet(owner));
  const vaults = await Promise.all(
    accounts.map(async ({ pubkey }) => {
      try {
        const vault = await program.account.creditVault.fetchNullable(pubkey);
        if (!vault) return null;
        const policy = await program.account.spendPolicy.fetch(policyPda(pubkey));
        return composeVault(pubkey, vault, policy);
      } catch {
        return null;
      }
    }),
  );
  return vaults.filter((v): v is Vault => v !== null);
}

/**
 * Discover all vaults whose `agent` field matches the given pubkey, directly
 * from the chain. Used by AgentDetail to list "vaults funding this agent".
 *
 * Layout: 8-byte Anchor discriminator + owner(32) + agent(32) + ...
 * Agent sits at offset 40.
 */
export async function readVaultsFromChainByAgent(
  connection: Connection,
  agent: PublicKey,
): Promise<Vault[]> {
  const accounts = await connection.getProgramAccounts(CREDIT_VAULT_PROGRAM_ID, {
    filters: [{ memcmp: { offset: 40, bytes: agent.toBase58() } }],
  });
  const program = buildProgram(connection, readOnlyWallet(agent));
  const vaults = await Promise.all(
    accounts.map(async ({ pubkey }) => {
      try {
        const vault = await program.account.creditVault.fetchNullable(pubkey);
        if (!vault) return null;
        const policy = await program.account.spendPolicy.fetch(policyPda(pubkey));
        return composeVault(pubkey, vault, policy);
      } catch {
        return null;
      }
    }),
  );
  return vaults.filter((v): v is Vault => v !== null);
}

type AgentProfileAccount = {
  authority: PublicKey;
  owner: PublicKey;
  externalAgentId: BN | number;
  totalTransactions: BN | number;
  totalVolumeUsdc: BN | number;
  consecutiveSuccess: number;
  totalFeedbackCount: number;
  activeNegativeFeedbackCount: number;
  servicesUsed: number;
  firstActiveSlot: BN | number;
  lastActiveSlot: BN | number;
  reputationScore: number;
};

/**
 * Discover all agent profiles owned by the given pubkey, directly from the
 * chain. Layout: 8-byte Anchor discriminator + authority(32) + owner(32) + ...
 * Owner sits at byte offset 40, hence the memcmp filter.
 */
/**
 * Read a single agent profile from chain by its authority (= agent pubkey).
 * Used by the agent-detail page when the backend indexer doesn't have it.
 */
export async function readAgentFromChain(
  connection: Connection,
  agentPubkey: PublicKey,
): Promise<Agent | null> {
  const program = buildReputationProgram(connection, readOnlyWallet(agentPubkey));
  const profilePda = agentProfilePda(agentPubkey);
  try {
    const acc = (await program.account.agentProfile.fetchNullable(
      profilePda,
    )) as AgentProfileAccount | null;
    if (!acc) return null;
    return composeAgent(acc);
  } catch {
    return null;
  }
}

export async function readAgentsFromChainByOwner(
  connection: Connection,
  owner: PublicKey,
): Promise<Agent[]> {
  const accounts = await connection.getProgramAccounts(REPUTATION_PROGRAM_ID, {
    filters: [{ memcmp: { offset: 40, bytes: owner.toBase58() } }],
  });
  const program = buildReputationProgram(connection, readOnlyWallet(owner));
  const agents = await Promise.all(
    accounts.map(async ({ pubkey }) => {
      try {
        const acc = (await program.account.agentProfile.fetchNullable(
          pubkey,
        )) as AgentProfileAccount | null;
        if (!acc) return null;
        return composeAgent(acc);
      } catch {
        return null;
      }
    }),
  );
  return agents.filter((a): a is Agent => a !== null);
}

// Anchor IDL spec 0.1.0 keeps field names exactly as authored, so accounts
// decoded from the raw IDL come back snake_case (`reputation_score`), while the
// codegen-typed program would expose camelCase. Try both so this code works
// regardless of which decode path Anchor took.
function pick<T>(obj: Record<string, unknown>, ...keys: string[]): T {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined) return v as T;
  }
  return undefined as T;
}

type ServiceRegistryAccount = {
  authority: PublicKey;
  name: number[] | Uint8Array;
  category: Record<string, unknown>;
  totalAgentsServed: BN | number;
  totalVolumeReceivedUsdc: BN | number;
  active: boolean;
  firstActiveSlot: BN | number;
  lastActiveSlot: BN | number;
};

// Anchor 0.31 prepends the 8-byte account discriminator to every account
// payload. We match the discriminator manually so a single stranded account
// (e.g. one created under an older `ServiceRegistry` layout) doesn't take
// down the whole list — anchor's `.all()` throws on the first decode error.
const SERVICE_REGISTRY_DISCRIMINATOR = Uint8Array.from([
  64, 49, 188, 90, 102, 27, 218, 35,
]);

/**
 * Discover every ServiceRegistry account on chain. Uses raw
 * `getProgramAccounts` + per-account try/catch so a single decode failure
 * (e.g. a stranded pre-upgrade account) doesn't blank the whole list.
 */
export async function readServicesFromChain(connection: Connection): Promise<Service[]> {
  const dummy = Keypair.generate();
  const program = buildReputationProgram(connection, readOnlyWallet(dummy.publicKey));
  const accounts = await connection.getProgramAccounts(REPUTATION_PROGRAM_ID, {
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: bs58.encode(SERVICE_REGISTRY_DISCRIMINATOR),
        },
      },
    ],
  });
  const decoded = await Promise.all(
    accounts.map(async ({ pubkey }) => {
      try {
        const acc = (await program.account.serviceRegistry.fetchNullable(
          pubkey,
        )) as ServiceRegistryAccount | null;
        if (!acc) return null;
        return composeService(pubkey, acc);
      } catch {
        return null;
      }
    }),
  );
  return decoded.filter((s): s is Service => s !== null);
}

function composeService(registry: PublicKey, acc: ServiceRegistryAccount): Service {
  const raw = acc as unknown as Record<string, unknown>;
  const nameBytes = (pick<number[] | Uint8Array>(raw, "name") ?? []) as number[] | Uint8Array;
  const name = decodePaddedBytes(nameBytes);
  const cat = pick<Record<string, unknown>>(raw, "category") ?? {};
  return {
    pubkey: acc.authority.toBase58(),
    registry: registry.toBase58(),
    name,
    category: categoryFromVariant(cat),
    total_agents_served: Number(pick<BN | number>(raw, "total_agents_served", "totalAgentsServed") ?? 0),
    total_volume_received_usdc: Number(
      pick<BN | number>(raw, "total_volume_received_usdc", "totalVolumeReceivedUsdc") ?? 0,
    ),
    active: Boolean(pick<boolean>(raw, "active") ?? false),
    first_active_slot: Number(pick<BN | number>(raw, "first_active_slot", "firstActiveSlot") ?? 0),
    last_active_slot: Number(pick<BN | number>(raw, "last_active_slot", "lastActiveSlot") ?? 0),
  };
}

function decodePaddedBytes(bytes: number[] | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  // Trim trailing NULs from fixed-size byte arrays.
  let end = arr.length;
  while (end > 0 && arr[end - 1] === 0) end -= 1;
  return new TextDecoder("utf-8").decode(arr.slice(0, end));
}

function categoryFromVariant(v: Record<string, unknown>): Service["category"] {
  const key = Object.keys(v)[0] ?? "other";
  switch (key) {
    case "dataFeed":
    case "data_feed":
      return "DataFeed";
    case "compute":
      return "Compute";
    case "swap":
      return "Swap";
    case "rpc":
      return "Rpc";
    default:
      return "Other";
  }
}

function composeAgent(acc: AgentProfileAccount): Agent {
  const raw = acc as unknown as Record<string, unknown>;
  return {
    pubkey: acc.authority.toBase58(),
    owner: acc.owner.toBase58(),
    init_slot: Number(pick<BN | number>(raw, "first_active_slot", "firstActiveSlot") ?? 0),
    score: Number(pick<number>(raw, "reputation_score", "reputationScore") ?? 0),
    total_transactions: Number(pick<BN | number>(raw, "total_transactions", "totalTransactions") ?? 0),
    total_volume_usdc: Number(pick<BN | number>(raw, "total_volume_usdc", "totalVolumeUsdc") ?? 0),
    services_used: Number(pick<number>(raw, "services_used", "servicesUsed") ?? 0),
    consecutive_success: Number(pick<number>(raw, "consecutive_success", "consecutiveSuccess") ?? 0),
    total_feedback_count: Number(pick<number>(raw, "total_feedback_count", "totalFeedbackCount") ?? 0),
    active_negative_feedback_count: Number(
      pick<number>(raw, "active_negative_feedback_count", "activeNegativeFeedbackCount") ?? 0,
    ),
    last_active_slot: Number(pick<BN | number>(raw, "last_active_slot", "lastActiveSlot") ?? 0),
    updated_at: new Date().toISOString(),
  };
}

function composeVault(
  pubkey: PublicKey,
  vault: CreditVaultAccount,
  policy: SpendPolicyAccount,
): Vault {
  const v = vault as unknown as Record<string, unknown>;
  const p = policy as unknown as Record<string, unknown>;
  const usdcMint = pick<PublicKey>(v, "usdc_mint", "usdcMint");
  const vaultAta = pick<PublicKey>(v, "vault_token_account", "vaultTokenAccount");
  const whitelistArr = (pick<PublicKey[]>(p, "whitelist") ?? []) as PublicKey[];
  const zero = PublicKey.default.toBase58();
  const whitelist = whitelistArr
    .map((pk) => pk.toBase58())
    .filter((b58) => b58 !== zero);
  return {
    pubkey: pubkey.toBase58(),
    owner: vault.owner.toBase58(),
    agent: vault.agent.toBase58(),
    usdc_mint: usdcMint.toBase58(),
    vault_token_account: vaultAta.toBase58(),
    total_deposited: Number(pick<BN | number>(v, "total_deposited", "totalDeposited") ?? 0),
    total_withdrawn: Number(pick<BN | number>(v, "total_withdrawn", "totalWithdrawn") ?? 0),
    total_spent: Number(pick<BN | number>(v, "total_spent", "totalSpent") ?? 0),
    total_claimed: Number(pick<BN | number>(v, "total_claimed", "totalClaimed") ?? 0),
    frozen: vault.frozen,
    per_tx_limit_usdc: Number(pick<BN | number>(p, "per_tx_limit_usdc", "perTxLimitUsdc") ?? 0),
    hourly_limit_usdc: Number(pick<BN | number>(p, "hourly_limit_usdc", "hourlyLimitUsdc") ?? 0),
    lifetime_limit_usdc: Number(pick<BN | number>(p, "lifetime_limit_usdc", "lifetimeLimitUsdc") ?? 0),
    allow_post_pay: Boolean(pick<boolean>(p, "allow_post_pay", "allowPostPay") ?? false),
    whitelist,
    created_slot: Number(pick<BN | number>(v, "created_slot", "createdSlot") ?? 0),
    last_active_slot: Number(pick<BN | number>(v, "last_active_slot", "lastActiveSlot") ?? 0),
    updated_at: new Date().toISOString(),
  };
}

// ---- internals ----

// We use a loosely-typed Program here because the SDK's vendored IDL is exported
// as the generic Idl shape, not the strongly-typed `Program<CreditVault>` that
// Anchor's codegen would produce. Runtime calls are still correct.
type CreditVaultAccount = {
  owner: PublicKey;
  agent: PublicKey;
  usdcMint: PublicKey;
  vaultTokenAccount: PublicKey;
  totalDeposited: BN | number;
  totalWithdrawn: BN | number;
  totalSpent: BN | number;
  totalClaimed: BN | number;
  frozen: boolean;
  createdSlot: BN | number;
  lastActiveSlot: BN | number;
};

type SpendPolicyAccount = {
  perTxLimitUsdc: BN | number;
  hourlyLimitUsdc: BN | number;
  lifetimeLimitUsdc: BN | number;
  allowPostPay: boolean;
  whitelist: PublicKey[];
};

type LooseProgram = {
  methods: {
    deposit: (amount: BN) => {
      accounts: (a: Record<string, PublicKey>) => {
        instruction: () => Promise<TransactionInstruction>;
      };
    };
    updatePolicy: (
      perTx: BN,
      hourly: BN,
      lifetime: BN,
      allowPostPay: boolean,
      whitelist: PublicKey[],
    ) => {
      accounts: (a: Record<string, PublicKey>) => {
        instruction: () => Promise<TransactionInstruction>;
      };
    };
    freezeVault: () => {
      accounts: (a: Record<string, PublicKey>) => {
        instruction: () => Promise<TransactionInstruction>;
      };
    };
    unfreezeVault: () => {
      accounts: (a: Record<string, PublicKey>) => {
        instruction: () => Promise<TransactionInstruction>;
      };
    };
    createVault: (
      perTx: BN,
      hourly: BN,
      lifetime: BN,
      allowPostPay: boolean,
    ) => {
      accounts: (a: Record<string, PublicKey>) => {
        instruction: () => Promise<TransactionInstruction>;
      };
    };
  };
  account: {
    spendPolicy: { fetch: (pk: PublicKey) => Promise<SpendPolicyAccount> };
    creditVault: { fetchNullable: (pk: PublicKey) => Promise<CreditVaultAccount | null> };
  };
};

function buildProgram(connection: Connection, wallet: Wallet): LooseProgram {
  const provider = new AnchorProvider(
    connection,
    {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction.bind(wallet),
      signAllTransactions: (txs: Transaction[]) =>
        Promise.all(txs.map((t) => wallet.signTransaction(t))),
    } as unknown as AnchorProvider["wallet"],
    AnchorProvider.defaultOptions(),
  );
  return new Program(creditVaultIdl, provider) as unknown as LooseProgram;
}

function readOnlyWallet(pubkey: PublicKey): Wallet {
  return {
    publicKey: pubkey,
    signTransaction: () => {
      throw new Error("readOnlyWallet cannot sign");
    },
  };
}

async function sendOne(
  connection: Connection,
  wallet: Wallet,
  ...ixs: Parameters<Transaction["add"]>
): Promise<TransactionSignature> {
  return sendWithSigners(connection, wallet, ixs, []);
}

/**
 * Send a tx where additional Keypair signers (beyond the connected wallet)
 * also need to sign — e.g. a freshly-generated agent keypair signing alongside
 * the owner wallet for `initialize_agent` or `create_vault` in the separate-
 * agent flow.
 *
 * Order matters: we partial-sign with the extras first so their signature
 * slots are filled, THEN ask the wallet to sign. Wallet's signTransaction
 * preserves existing signatures and adds its own.
 */
async function sendWithSigners(
  connection: Connection,
  wallet: Wallet,
  ixs: Parameters<Transaction["add"]>,
  extraSigners: Keypair[],
): Promise<TransactionSignature> {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = wallet.publicKey;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  if (extraSigners.length > 0) tx.partialSign(...extraSigners);
  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  // `confirmTransaction` resolves when the tx hits a confirmed block — even
  // if the tx itself reverted (insufficient SOL, custom program error, etc.).
  // The actual success/failure lives in `value.err`. Throw on failure so the
  // UI never claims "Done" for a tx that didn't actually do the thing.
  const result = await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  if (result.value.err) {
    throw new TransactionFailedError(sig, result.value.err);
  }
  return sig;
}

export class TransactionFailedError extends Error {
  constructor(
    public readonly signature: string,
    public readonly chainError: unknown,
  ) {
    const errStr =
      typeof chainError === "string"
        ? chainError
        : JSON.stringify(chainError);
    super(`Transaction ${signature.slice(0, 8)}… failed on chain: ${errStr}`);
    this.name = "TransactionFailedError";
  }
}
