import type { SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  stroke: "currentColor",
  strokeWidth: 1.25,
  fill: "none",
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function FleetIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="2" y="3" width="5" height="5" rx="1" />
      <rect x="9" y="3" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="12" height="4" rx="1" />
    </svg>
  );
}

export function AgentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="8" cy="6" r="3" />
      <path d="M3 14 c0-2.5 2-4.5 5-4.5 s5 2 5 4.5" />
    </svg>
  );
}

export function VaultIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="2" y="3.5" width="12" height="9" rx="1.2" />
      <circle cx="10" cy="8" r="1.8" />
      <path d="M10 5.5 v1 M10 9.5 v1" />
    </svg>
  );
}

export function ActivityIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M2 8h2.5 l2-4 2 8 2-5 1.5 1H14" />
    </svg>
  );
}

export function ServiceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M2 5 l6-3 6 3 -6 3 z" />
      <path d="M2 9 l6 3 6-3" />
      <path d="M2 7 l6 3 6-3" />
    </svg>
  );
}

export function AnalyticsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M2 13 V3 M2 13 H14" />
      <path d="M5 11 V8 M8 11 V5 M11 11 V9" />
    </svg>
  );
}

export function SdkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M5 4 L2 8 L5 12 M11 4 L14 8 L11 12 M9 3 L7 13" />
    </svg>
  );
}

export function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} width={13} height={13} viewBox="0 0 13 13" {...props}>
      <circle cx="5.5" cy="5.5" r="3.5" />
      <path d="M8 8 L11.5 11.5" />
    </svg>
  );
}

export function InboxIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} width={14} height={14} viewBox="0 0 14 14" {...props}>
      <path d="M2 4 V11 H12 V4 L7 8 z" />
    </svg>
  );
}

export function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} width={14} height={14} viewBox="0 0 14 14" {...props}>
      <circle cx="7" cy="7" r="2.2" />
      <path d="M7 1 v2 M7 11 v2 M1 7 h2 M11 7 h2 M2.5 2.5 l1.5 1.5 M10 10 l1.5 1.5 M2.5 11.5 l1.5-1.5 M10 4 l1.5-1.5" />
    </svg>
  );
}

export function CaretDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} width={10} height={10} viewBox="0 0 10 10" strokeWidth={1.3} {...props}>
      <path d="M2 4 L5 7 L8 4" />
    </svg>
  );
}
