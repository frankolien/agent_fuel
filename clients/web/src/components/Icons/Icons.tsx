import type { SVGProps } from "react";

const baseProps: SVGProps<SVGSVGElement> = {
  width: 28,
  height: 28,
  viewBox: "0 0 28 28",
  stroke: "currentColor",
  strokeWidth: 1.4,
  fill: "none",
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function ShieldCheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M14 3 L23 7 V14 C23 19 19 22.5 14 25 C9 22.5 5 19 5 14 V7 Z" />
      <path d="M10 14 L13 17 L18 11" />
    </svg>
  );
}

export function VaultIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="4" y="6" width="20" height="16" rx="2" />
      <circle cx="17" cy="14" r="3" />
      <path d="M17 10 V11 M17 17 V18 M21 14 H20 M14 14 H13" />
    </svg>
  );
}

export function PoliciesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M6 8 H22 M6 14 H22 M6 20 H22" />
      <circle cx="10" cy="8" r="2" fill="currentColor" />
      <circle cx="18" cy="14" r="2" fill="currentColor" />
      <circle cx="13" cy="20" r="2" fill="currentColor" />
    </svg>
  );
}

export function SdkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M10 8 L4 14 L10 20 M18 8 L24 14 L18 20 M16 6 L12 22" />
    </svg>
  );
}

export function X402Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M4 14 H20 M14 8 L20 14 L14 20" />
      <circle cx="23" cy="14" r="1.5" fill="currentColor" />
    </svg>
  );
}

const tutBase: SVGProps<SVGSVGElement> = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  stroke: "currentColor",
  strokeWidth: 1.4,
  fill: "none",
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function DocIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...tutBase} {...props}>
      <path d="M4 4 H16 V16 H4 Z M7 8 H13 M7 11 H13 M7 14 H10" />
    </svg>
  );
}

export function CameraIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...tutBase} {...props}>
      <rect x="3" y="5" width="14" height="11" rx="1.5" />
      <circle cx="12" cy="10.5" r="2.2" />
    </svg>
  );
}

export function PulseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...tutBase} {...props}>
      <path d="M4 10 H8 L10 5 L13 15 L15 10 H17" />
    </svg>
  );
}
