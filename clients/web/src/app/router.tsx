import { createBrowserRouter } from "react-router-dom";
import { Home } from "@/pages/Home/Home";
import { SignIn } from "@/pages/SignIn/SignIn";
import { PublicReputation } from "@/pages/PublicReputation/PublicReputation";
import { Docs } from "@/pages/Docs/Docs";
import { HowItWorks } from "@/pages/HowItWorks/HowItWorks";
import { ConsoleLayout } from "@/pages/Console/ConsoleLayout";
import { Fleet } from "@/pages/Console/screens/Fleet";
import { Agents } from "@/pages/Console/screens/Agents";
import { AgentDetail } from "@/pages/Console/screens/AgentDetail";
import { Vaults } from "@/pages/Console/screens/Vaults";
import { VaultDetail } from "@/pages/Console/screens/VaultDetail";
import { VaultPolicy } from "@/pages/Console/screens/VaultPolicy";
import { Activity } from "@/pages/Console/screens/Activity";
import { Services } from "@/pages/Console/screens/Services";
import { Analytics } from "@/pages/Console/screens/Analytics";
import { Sdk } from "@/pages/Console/screens/Sdk";
import { RequireAuth } from "./auth";
import { RootLayout } from "./RootLayout";

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/signin", element: <SignIn /> },
      { path: "/docs", element: <Docs /> },
      { path: "/how-it-works", element: <HowItWorks /> },
      { path: "/reputation/:agent", element: <PublicReputation /> },
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
          { path: "vaults/:pubkey/policy", element: <VaultPolicy /> },
          { path: "activity", element: <Activity /> },
          { path: "services", element: <Services /> },
          { path: "analytics", element: <Analytics /> },
          { path: "sdk", element: <Sdk /> },
        ],
      },
    ],
  },
]);
