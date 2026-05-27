import type { ReactNode } from "react";

type SectionHeadingProps = {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
};

export function SectionHeading({ eyebrow, title, lede }: SectionHeadingProps) {
  return (
    <div className="mx-auto flex max-w-[var(--container-shell)] flex-col items-start justify-between gap-6 px-[var(--pad)] pb-9 md:flex-row md:items-end">
      <div>
        <div className="mb-3.5 font-mono text-[11.5px] tracking-[0.18em] whitespace-nowrap text-mint-soft uppercase">
          {eyebrow}
        </div>
        <h2 className="m-0 text-[clamp(40px,4.4vw,64px)] leading-[1.05] font-medium tracking-[-0.03em] text-balance [&_em]:not-italic [&_em]:text-mint">
          {title}
        </h2>
      </div>
      {lede ? (
        <p className="m-0 max-w-[420px] text-[17px] text-muted text-pretty">{lede}</p>
      ) : null}
    </div>
  );
}
