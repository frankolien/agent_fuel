import { Pill } from "@/components/Pill/Pill";

export function Cta() {
  return (
    <section className="mx-auto mt-[120px] mb-20 max-w-[var(--container-shell)] px-[var(--pad)]">
      <div className="cta-card-bg relative overflow-hidden rounded-[28px] border border-[var(--color-line)] px-6 py-12 text-center sm:px-10 sm:py-16 lg:px-16 lg:py-24">
        <div className="relative mx-auto max-w-[720px]">
          <div className="mb-[18px] inline-block font-mono text-[11.5px] tracking-[0.18em] text-mint-soft uppercase">
            Get started
          </div>
          <h2 className="m-0 mb-[18px] text-[clamp(40px,4.6vw,64px)] leading-[1.08] font-medium tracking-[-0.03em] text-balance">
            Trust, on{" "}
            <em className="text-glow-mint text-mint not-italic">credit terms</em>.
          </h2>
          <p className="mx-auto mt-0 mb-8 max-w-[540px] text-[17px] text-muted">
            Open the operator console with seeded data — or jump straight to the SDK and ship your
            first vault-mediated spend today.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Pill to="/console" variant="solid" size="lg">
              Open console
            </Pill>
            <Pill href="#sdk" variant="glow" size="lg">
              View the SDK ↗
            </Pill>
          </div>
        </div>
      </div>
    </section>
  );
}
