import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

type SkeletonProps = {
  className?: string;
  style?: CSSProperties;
};

/** Pulsing placeholder block. Use while a query is loading. */
export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      style={style}
      className={cn("animate-pulse rounded-md bg-white/[0.06]", className)}
    />
  );
}

export function SkeletonRows({ rows, height = 36 }: { rows: number; height?: number }) {
  return (
    <div className="grid gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="w-full" style={{ height }} />
      ))}
    </div>
  );
}
