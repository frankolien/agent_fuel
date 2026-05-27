import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/cn";

type Variant = "default" | "solid" | "glow";
type Size = "md" | "sm" | "lg";

type CommonProps = {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  className?: string;
};

type ExternalProps = CommonProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    to?: never;
  };

type InternalProps = CommonProps & {
  to: string;
  href?: never;
};

export type PillProps = ExternalProps | InternalProps;

const BASE =
  "inline-flex items-center gap-2 rounded-full whitespace-nowrap border tracking-[-0.005em] " +
  "transition-[background-color,border-color,color,box-shadow] duration-150 ease-out";

const SIZES: Record<Size, string> = {
  md: "h-[42px] px-[22px] text-[14.5px]",
  sm: "h-9 px-4 text-[13.5px]",
  lg: "h-12 px-[26px] text-[15.5px]",
};

const VARIANTS: Record<Variant, string> = {
  default:
    "border-[var(--color-line-2)] bg-transparent text-fg hover:border-white/30 hover:bg-white/5",
  solid: "border-transparent bg-mint text-[#0a0b0c] hover:bg-[#ebf7f2]",
  glow: "border-white/50 bg-transparent text-fg pill-glow",
};

export function Pill(props: PillProps) {
  const { variant = "default", size = "md", children, className } = props;
  const cls = cn(BASE, SIZES[size], VARIANTS[variant], className);

  if ("to" in props && props.to) {
    return (
      <Link to={props.to} className={cls}>
        {children}
      </Link>
    );
  }

  const { href, ...rest } = props as ExternalProps;
  return (
    <a href={href} className={cls} {...rest}>
      {children}
    </a>
  );
}
