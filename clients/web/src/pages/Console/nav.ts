import type { ComponentType, SVGProps } from "react";
import {
  ActivityIcon,
  AgentIcon,
  AnalyticsIcon,
  FleetIcon,
  SdkIcon,
  ServiceIcon,
  VaultIcon,
} from "./icons";

export type ConsoleNavItem = {
  key: string;
  label: string;
  path: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  hasPulse?: boolean;
};

export const CONSOLE_NAV: ReadonlyArray<ConsoleNavItem> = [
  { key: "fleet", label: "Fleet", path: "/console", Icon: FleetIcon },
  { key: "agents", label: "Agents", path: "/console/agents", Icon: AgentIcon },
  { key: "vaults", label: "Vaults", path: "/console/vaults", Icon: VaultIcon },
  { key: "activity", label: "Activity", path: "/console/activity", Icon: ActivityIcon, hasPulse: true },
  { key: "services", label: "Services", path: "/console/services", Icon: ServiceIcon },
  { key: "analytics", label: "Analytics", path: "/console/analytics", Icon: AnalyticsIcon },
  { key: "sdk", label: "SDK", path: "/console/sdk", Icon: SdkIcon },
];
