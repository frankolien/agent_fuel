// Register a service on chain so agents can pay against it and accrue
// reputation. Two signers: sponsor (pays rent, submits tx) and service
// (long-lived signing identity — its keypair will co-sign every future
// `record_payment`). Idempotent only at the keypair level — re-running
// with the same key fails because the registry PDA already exists.

import { SystemProgram, type Connection, type Keypair } from "@solana/web3.js";
import { serviceRegistryPda } from "./pda.js";
import {
  buildProvider,
  reputationProgram,
  type ServiceCategoryArg,
} from "./programs.js";
import type { ServiceCategory } from "./types.js";

const NAME_BYTES = 32;
const URI_BYTES = 128;

export type RegisterServiceArgs = {
  /** Pays rent for the registry PDA and submits the tx. Typically the
   *  same wallet that owns the service brand. */
  sponsor: Keypair;
  /** Long-lived service identity. Co-signs registration to prevent
   *  someone else from squatting on the keypair. Must hold ~0.05 SOL
   *  for downstream `record_payment` receipt PDAs to be fundable from
   *  the service side. */
  service: Keypair;
  name: string;
  category: ServiceCategory;
  /** Off-chain metadata URI (pricing, docs, endpoint). Empty string is
   *  allowed; chain just stores zero-padded bytes. */
  serviceUri?: string;
  connection: Connection;
};

export type RegisterServiceResult = {
  signature: string;
};

export async function registerService(
  args: RegisterServiceArgs,
): Promise<RegisterServiceResult> {
  const { sponsor, service, connection } = args;

  if (args.name.length === 0) {
    throw new Error("registerService: name must not be empty");
  }
  if (Buffer.byteLength(args.name, "utf8") > NAME_BYTES) {
    throw new Error(
      `registerService: name exceeds ${NAME_BYTES} bytes (got ${Buffer.byteLength(args.name, "utf8")})`,
    );
  }
  const uri = args.serviceUri ?? "";
  if (Buffer.byteLength(uri, "utf8") > URI_BYTES) {
    throw new Error(
      `registerService: serviceUri exceeds ${URI_BYTES} bytes (got ${Buffer.byteLength(uri, "utf8")})`,
    );
  }

  const registry = serviceRegistryPda(service.publicKey);
  const provider = buildProvider(connection, sponsor);
  const rep = reputationProgram(provider);

  const signature = await rep.methods
    .registerService(
      packFixed(args.name, NAME_BYTES),
      categoryArg(args.category),
      packFixed(uri, URI_BYTES),
    )
    .accounts({
      sponsor: sponsor.publicKey,
      service: service.publicKey,
      serviceRegistry: registry,
      systemProgram: SystemProgram.programId,
    })
    .signers([sponsor, service])
    .rpc();

  return { signature };
}

function packFixed(s: string, length: number): number[] {
  const buf = Buffer.alloc(length);
  buf.write(s, 0, "utf8");
  return Array.from(buf);
}

function categoryArg(c: ServiceCategory): ServiceCategoryArg {
  // Borsh wire format: empty-struct variants, snake_case keys.
  switch (c) {
    case "DataFeed":
      return { dataFeed: {} };
    case "Compute":
      return { compute: {} };
    case "Swap":
      return { swap: {} };
    case "Rpc":
      return { rpc: {} };
    case "Other":
      return { other: {} };
  }
}
