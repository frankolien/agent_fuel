import { SectionHeading } from "@/components/SectionHeading/SectionHeading";
import { STEPS } from "../content";

export function HowItWorks() {
  return (
    <section id="how" className="pt-[120px]">
      <SectionHeading
        eyebrow="x402 Integration"
        title={
          <>
            How a paid request <em>flows</em>.
          </>
        }
        lede="The agent SDK intercepts every 402 response and turns it into a policy-checked, on-chain spend — without changing your agent's logic."
      />
      <div className="mx-auto grid max-w-[var(--container-shell)] grid-cols-1 gap-3.5 px-[var(--pad)] md:grid-cols-4">
        {STEPS.map((step) => (
          <article
            key={step.num}
            className="relative grid gap-3 rounded-[18px] border border-[var(--color-line)] bg-surface px-6 py-[26px]"
          >
            <div className="font-mono text-xs tracking-[0.16em] text-mint">{step.num}</div>
            <h3 className="m-0 text-[19px] leading-[1.25] font-medium tracking-[-0.015em]">
              {step.title.lead}
              {step.title.mono ? <span className="font-mono">{step.title.mono}</span> : null}
              {step.title.tail}
            </h3>
            <p className="m-0 text-sm text-muted">{step.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
