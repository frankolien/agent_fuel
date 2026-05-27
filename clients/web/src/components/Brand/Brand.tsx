import { Link, useLocation } from "react-router-dom";

type BrandProps = {
  to?: string;
  size?: number;
};

export function Brand({ to = "/", size = 22 }: BrandProps) {
  const { pathname } = useLocation();
  const onClick = () => {
    if (pathname === to) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  return (
    <Link
      to={to}
      onClick={onClick}
      className="inline-flex items-center gap-4 text-[13px] font-semibold tracking-[0.18em]"
    >
      <span>AGENT</span>
      <span
        className="grid place-items-center text-mint"
        aria-hidden="true"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} viewBox="0 0 22 22">
          <path
            d="M4 14 L11 4 L18 14 H14.5 L11 9 L7.5 14 Z M7 16 H15 M11 18.5 L11 19.5"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span>FUEL</span>
    </Link>
  );
}
