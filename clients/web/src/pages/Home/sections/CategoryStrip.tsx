import { CATEGORIES } from "../content";

export function CategoryStrip() {
  return (
    <section
      aria-label="Primitives"
      className="mx-auto mt-3.5 grid max-w-[var(--container-shell)] grid-cols-2 gap-3.5 px-[var(--pad)] md:grid-cols-5"
    >
      {CATEGORIES.map((cat) => {
        const Icon = cat.Icon;
        return (
          <a
            key={cat.id}
            href={cat.href}
            className="grid grid-rows-[28px_auto] gap-7 rounded-[20px] border border-[var(--color-line)] bg-surface px-6 pt-[22px] pb-[26px] text-fg transition-[background-color,border-color,transform] duration-150 ease-out hover:-translate-y-px hover:border-[var(--color-line-2)] hover:bg-surface-2"
          >
            <span className="h-7 w-7 text-mint" aria-hidden="true">
              <Icon />
            </span>
            <span className="text-[22px] font-medium tracking-[-0.02em]">{cat.label}</span>
          </a>
        );
      })}
    </section>
  );
}
