import type { ReactNode } from "react";

type ScreenProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
};

export function Screen({ eyebrow, title, subtitle, actions, children }: ScreenProps) {
  return (
    <div className="mx-auto max-w-[1500px] px-4 pt-5 pb-10 sm:px-6 sm:pt-6 lg:px-7 lg:pt-7 lg:pb-14">
      {/* Stack header rows on narrow screens so the actions don't crowd the
          title; revert to the side-by-side layout from sm+ up. */}
      <div className="mb-4 flex flex-col gap-3 border-b border-white/[0.09] pb-4 sm:mb-[18px] sm:flex-row sm:items-end sm:justify-between sm:gap-4 sm:pb-[18px]">
        <div className="min-w-0">
          {eyebrow ? (
            <div className="inline-flex flex-wrap items-center gap-2 text-[11px] tracking-[0.05em] text-muted uppercase">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="m-0 mt-1 mb-1.5 text-[22px] font-semibold tracking-[-0.02em] sm:text-[26px]">
            {title}
          </h1>
          {subtitle ? <p className="m-0 text-[13px] text-muted sm:text-[13.5px]">{subtitle}</p> : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">{actions}</div>
        ) : null}
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
