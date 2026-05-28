import { useState, type ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useServicesQuery } from "@/lib/api/hooks";
import { formatNumberCompact, formatUsdcCompact, shortPubkey } from "@/lib/format";
import type { Service } from "@/types/api";
import { RegisterServiceModal } from "../components/RegisterServiceModal";
import { SetServiceActiveModal } from "../components/SetServiceActiveModal";
import { Screen } from "./Screen";
import { SkeletonRows } from "../components/Skeleton";

const CATEGORY_LABEL: Record<Service["category"], string> = {
  DataFeed: "data feed",
  Compute: "compute",
  Swap: "swap",
  Rpc: "rpc",
  Other: "other",
};

type ToggleTarget = { service: Service; nextActive: boolean };

export function Services() {
  const { data, isLoading, error } = useServicesQuery();
  const { publicKey } = useWallet();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<ToggleTarget | null>(null);

  return (
    <Screen
      eyebrow={
        <>
          <span>x402 service providers</span>
          <span className="text-muted">·</span>
          <span>on-chain registry</span>
        </>
      }
      title="Services"
      subtitle="Whitelisted x402 providers your agents can pay."
      actions={
        <div className="flex items-center gap-3">
          {data ? (
            <span className="font-mono text-[11.5px] tracking-[0.06em] text-muted uppercase">
              {data.length} registered
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setRegisterOpen(true)}
            disabled={!publicKey}
            className="rounded-full bg-mint px-4 py-1.5 text-[12.5px] font-semibold text-bg transition hover:bg-mint-soft disabled:cursor-not-allowed disabled:opacity-40"
            title={publicKey ? "Register your wallet as a service" : "Connect a wallet first"}
          >
            + Register service
          </button>
        </div>
      }
    >
      {isLoading ? <SkeletonRows rows={6} height={56} /> : null}
      {error ? <ErrorState message={(error as Error).message} /> : null}
      {data ? (
        <ServicesTable
          services={data}
          onToggleActive={(service, nextActive) => setToggleTarget({ service, nextActive })}
        />
      ) : null}
      {registerOpen && <RegisterServiceModal onClose={() => setRegisterOpen(false)} />}
      {toggleTarget && (
        <SetServiceActiveModal
          serviceLabel={toggleTarget.service.name || shortPubkey(toggleTarget.service.pubkey)}
          expectedServicePubkey={toggleTarget.service.pubkey}
          setActive={toggleTarget.nextActive}
          onClose={() => setToggleTarget(null)}
        />
      )}
    </Screen>
  );
}

function ServicesTable({
  services,
  onToggleActive,
}: {
  services: ReadonlyArray<Service>;
  onToggleActive: (service: Service, nextActive: boolean) => void;
}) {
  if (services.length === 0) {
    return (
      <div className="grid place-items-center rounded-[10px] border border-dashed border-white/[0.09] bg-surface/40 px-6 py-20 text-center text-[13px] text-muted">
        No services registered on chain yet. Click "+ Register service" to add the first one.
      </div>
    );
  }
  // Sort by total volume desc — most active providers float to the top.
  const sorted = [...services].sort(
    (a, b) => b.total_volume_received_usdc - a.total_volume_received_usdc,
  );
  return (
    <div className="overflow-hidden rounded-[10px] border border-white/[0.09] bg-[#0e0f11]">
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-left">
            <Th>Service</Th>
            <Th>Category</Th>
            <Th align="right">Lifetime spend</Th>
            <Th align="right">Agents served</Th>
            <Th align="right">Status</Th>
            <Th>Address</Th>
            <Th align="right">&nbsp;</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((svc) => (
            <ServiceRow
              key={svc.pubkey}
              service={svc}
              onToggleActive={onToggleActive}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ServiceRow({
  service,
  onToggleActive,
}: {
  service: Service;
  onToggleActive: (service: Service, nextActive: boolean) => void;
}) {
  return (
    <tr className="border-t border-white/[0.05] hover:bg-white/[0.02]">
      <Td>
        <div className="flex items-center gap-2">
          <CategoryDot category={service.category} />
          <span className="text-[13.5px] text-fg">{service.name || "unnamed"}</span>
        </div>
      </Td>
      <Td>
        <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[10.5px] tracking-[0.04em] text-fg-2">
          {CATEGORY_LABEL[service.category]}
        </span>
      </Td>
      <Td align="right">
        <span className="font-mono text-[13px]">
          {formatUsdcCompact(service.total_volume_received_usdc)}
        </span>
      </Td>
      <Td align="right">
        <span className="font-mono text-[12.5px] text-fg-2">
          {formatNumberCompact(service.total_agents_served)}
        </span>
      </Td>
      <Td align="right">
        {service.active ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2 py-0.5 font-mono text-[10.5px] tracking-[0.06em] text-mint uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-mint" />
            active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E6B86F14] px-2 py-0.5 font-mono text-[10.5px] tracking-[0.06em] text-[#E6B86F] uppercase">
            paused
          </span>
        )}
      </Td>
      <Td>
        <CopyAddress address={service.pubkey} />
      </Td>
      <Td align="right">
        <button
          type="button"
          onClick={() => onToggleActive(service, !service.active)}
          className="rounded-full border border-[var(--color-line-2)] px-3 py-0.5 font-mono text-[10.5px] text-fg-2 hover:bg-surface-2"
          title="Requires the service keypair JSON"
        >
          {service.active ? "Pause" : "Resume"}
        </button>
      </Td>
    </tr>
  );
}

function CategoryDot({ category }: { category: Service["category"] }) {
  const tone: Record<Service["category"], string> = {
    DataFeed: "bg-mint",
    Compute: "bg-fg",
    Rpc: "bg-mint-soft",
    Swap: "bg-[#5BC0EB]",
    Other: "bg-muted",
  };
  return <span className={`inline-block h-2 w-2 rounded-sm ${tone[category]}`} />;
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      className="group inline-flex items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-surface-2 px-2 py-1 font-mono text-[11.5px] text-fg-2 hover:border-[var(--color-line-2)] hover:text-fg"
      title={address}
    >
      <span>{shortPubkey(address)}</span>
      <span className="text-muted group-hover:text-fg-2">{copied ? "✓" : "⧉"}</span>
    </button>
  );
}

function Th({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={
        "px-4 py-3 font-mono text-[11px] font-normal tracking-[0.06em] text-muted uppercase " +
        (align === "right" ? "text-right" : "text-left")
      }
    >
      {children}
    </th>
  );
}

function Td({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" }) {
  return <td className={"px-4 py-3 align-middle " + (align === "right" ? "text-right" : "")}>{children}</td>;
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-[10px] border border-[#E0857733] bg-[#E0857714] px-4 py-3 text-[13px] text-[#E08577]">
      Couldn't load services — <span className="font-mono">{message}</span>
    </div>
  );
}
