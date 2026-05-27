import { SectionHeading } from "@/components/SectionHeading/SectionHeading";
import { TUTORIALS } from "../content";

export function Tutorials() {
  return (
    <section id="docs" className="pt-[120px]">
      <SectionHeading
        eyebrow="Guides"
        title="Start building."
        lede="Plug Agent Fuel into Solana Agent Kit, ElizaOS, or your own agent runtime in under 15 minutes."
      />
      <div className="mx-auto grid max-w-[var(--container-shell)] grid-cols-1 gap-3.5 px-[var(--pad)] md:grid-cols-3">
        {TUTORIALS.map((tut) => {
          const Icon = tut.Icon;
          return (
            <a
              key={tut.title}
              href={tut.href}
              className="grid min-h-[220px] gap-3.5 rounded-[20px] border border-[var(--color-line)] bg-surface p-6 transition-[background-color,transform] duration-150 ease-out hover:-translate-y-px hover:bg-surface-2"
            >
              <div className="grid h-10 w-10 place-items-center rounded-[10px] border border-[var(--color-line)] bg-white/5 text-mint">
                <Icon />
              </div>
              <h3 className="m-0 text-[19px] font-medium tracking-[-0.015em]">{tut.title}</h3>
              <p className="m-0 text-sm text-muted">{tut.body}</p>
              <div className="mt-auto flex items-center justify-between font-mono text-[11.5px] tracking-[0.06em] text-muted uppercase">
                <span>{tut.meta}</span>
                <span className="text-mint">↗</span>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
