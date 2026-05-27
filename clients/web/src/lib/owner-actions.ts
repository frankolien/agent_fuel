// Owner-side write actions against the credit_vault program.
//
// The SDK's six functions are agent-side reads + spend(). Owner actions
// (deposit, updatePolicy, freeze) need the connected wallet to sign — they
// live here so the SDK can stay browser-agnostic for now.

import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  Transaction,
  type TransactionInstruction,
  type TransactionSignature,
} from "@solana/web3.js";
// The SDK's published browser bundle pulls in anchor's NodeWallet at the top
// level, which doesn't exist in the browser anchor bundle. Until the SDK is
// republished without that import, the web client reads the IDL JSON directly
// and inlines the two PDA helpers it needs.
import creditVaultIdl from "../../../sdk/src/idl/credit-vault.json";

const CREDIT_VAULT_PROGRAM_ID = new PublicKey(creditVaultIdl.address);

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

  const ix = await program.methods
    .updatePolicy(
      new BN(newPerTx),
      new BN(newHourly),
      new BN(newLifetime),
      current.allowPostPay,
      current.whitelist,
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

import type { Vault } from "@/types/api";

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

  return {
    pubkey: vaultPubkey.toBase58(),
    owner: vault.owner.toBase58(),
    agent: vault.agent.toBase58(),
    usdc_mint: vault.usdcMint.toBase58(),
    vault_token_account: vault.vaultTokenAccount.toBase58(),
    total_deposited: Number(vault.totalDeposited),
    total_withdrawn: Number(vault.totalWithdrawn),
    total_spent: Number(vault.totalSpent),
    total_claimed: Number(vault.totalClaimed),
    frozen: vault.frozen,
    per_tx_limit_usdc: Number(policy.perTxLimitUsdc),
    hourly_limit_usdc: Number(policy.hourlyLimitUsdc),
    lifetime_limit_usdc: Number(policy.lifetimeLimitUsdc),
    allow_post_pay: policy.allowPostPay,
    created_slot: Number(vault.createdSlot),
    last_active_slot: Number(vault.lastActiveSlot),
    updated_at: new Date().toISOString(),
  };
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

function composeVault(
  pubkey: PublicKey,
  vault: CreditVaultAccount,
  policy: SpendPolicyAccount,
): Vault {
  return {
    pubkey: pubkey.toBase58(),
    owner: vault.owner.toBase58(),
    agent: vault.agent.toBase58(),
    usdc_mint: vault.usdcMint.toBase58(),
    vault_token_account: vault.vaultTokenAccount.toBase58(),
    total_deposited: Number(vault.totalDeposited),
    total_withdrawn: Number(vault.totalWithdrawn),
    total_spent: Number(vault.totalSpent),
    total_claimed: Number(vault.totalClaimed),
    frozen: vault.frozen,
    per_tx_limit_usdc: Number(policy.perTxLimitUsdc),
    hourly_limit_usdc: Number(policy.hourlyLimitUsdc),
    lifetime_limit_usdc: Number(policy.lifetimeLimitUsdc),
    allow_post_pay: policy.allowPostPay,
    created_slot: Number(vault.createdSlot),
    last_active_slot: Number(vault.lastActiveSlot),
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
  const tx = new Transaction().add(...ixs);
  tx.feePayer = wallet.publicKey;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  const signed = await wallet.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return sig;
}
