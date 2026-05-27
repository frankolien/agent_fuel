import type { ReactNode } from "react";

type ScreenProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
};

export function Screen({ eyebrow, title, subtitle, actions, children }: ScreenProps) {
  return (
    <div className="mx-auto max-w-[1500px] px-7 pt-7 pb-14">
      <div className="mb-[18px] flex items-end justify-between gap-4 border-b border-white/[0.09] pb-[18px]">
        <div>
          {eyebrow ? (
            <div className="inline-flex items-center gap-2 text-[11px] tracking-[0.05em] text-muted uppercase">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="m-0 mt-1 mb-1.5 text-[26px] font-semibold tracking-[-0.02em]">{title}</h1>
          {subtitle ? <p className="m-0 text-[13.5px] text-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function ScreenPlaceholder({ note }: { note: string }) {
  return (
    <div className="grid place-items-center rounded-[10px] border border-dashed border-white/[0.09] bg-surface/40 px-6 py-20 text-center text-[13px] text-muted">
      {note}
    </div>
  );
}
