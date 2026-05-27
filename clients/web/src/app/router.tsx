import { createBrowserRouter } from "react-router-dom";
import { Home } from "@/pages/Home/Home";
import { SignIn } from "@/pages/SignIn/SignIn";
import { ConsoleLayout } from "@/pages/Console/ConsoleLayout";
import { Fleet } from "@/pages/Console/screens/Fleet";
import { Agents } from "@/pages/Console/screens/Agents";
import { AgentDetail } from "@/pages/Console/screens/AgentDetail";
import { Vaults } from "@/pages/Console/screens/Vaults";
import { VaultDetail } from "@/pages/Console/screens/VaultDetail";
import { Activity } from "@/pages/Console/screens/Activity";
import { Services } from "@/pages/Console/screens/Services";
import { Analytics } from "@/pages/Console/screens/Analytics";
import { Sdk } from "@/pages/Console/screens/Sdk";
import { RequireAuth } from "./auth";

export const router = createBrowserRouter([
  { path: "/", element: <Home /> },
  { path: "/signin", element: <SignIn /> },
  {
    path: "/console",
    element: (
      <RequireAuth>
        <ConsoleLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Fleet /> },
      { path: "agents", element: <Agents /> },
      { path: "agents/:pubkey", element: <AgentDetail /> },
      { path: "vaults", element: <Vaults /> },
      { path: "vaults/:pubkey", element: <VaultDetail /> },
      { path: "activity", element: <Activity /> },
      { path: "services", element: <Services /> },
      { path: "analytics", element: <Analytics /> },
      { path: "sdk", element: <Sdk /> },
    ],
  },
]);
