import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type CardProps = {
  title?: ReactNode;
  meta?: ReactNode;
  tools?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function Card({ title, meta, tools, children, className, bodyClassName }: CardProps) {
  return (
    <section
      className={cn(
        "rounded-[10px] border border-white/[0.09] bg-[#0e0f11] p-[18px]",
        className,
      )}
    >
      {(title || meta || tools) && (
        <div className="mb-3.5 flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            {title ? (
              <h2 className="m-0 text-[13.5px] font-semibold tracking-[-0.005em]">{title}</h2>
            ) : null}
            {meta ? <span className="text-[12px] text-muted">{meta}</span> : null}
          </div>
          {tools ? <div className="flex items-center gap-2">{tools}</div> : null}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
