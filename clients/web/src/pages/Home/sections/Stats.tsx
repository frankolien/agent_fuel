import { STATS } from "../content";

export function Stats() {
  return (
    <section
      aria-label="By the numbers"
      className="mx-auto mt-[120px] max-w-[var(--container-shell)] px-[var(--pad)]"
    >
      <div className="grid grid-cols-2 border-t border-b border-[var(--color-line)] md:grid-cols-4">
        {STATS.map((stat, i) => (
          <div
            key={stat.label}
            className={
              "px-7 py-9" +
              (i === STATS.length - 1
                ? ""
                : " border-r border-[var(--color-line)] max-md:[&:nth-child(2)]:border-r-0")
            }
          >
            <div className="mb-2.5 font-mono text-[11.5px] tracking-[0.16em] text-muted uppercase">
              {stat.label}
            </div>
            <div className="text-[clamp(36px,3.6vw,56px)] leading-none font-medium tracking-[-0.03em]">
              <em className="text-mint not-italic">{stat.value}</em>
            </div>
            <div className="mt-2 text-[13.5px] text-muted">{stat.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
