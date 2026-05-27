import { createBrowserRouter } from "react-router-dom";
import { Home } from "@/pages/Home/Home";
import { ConsoleLayout } from "@/pages/Console/ConsoleLayout";
import { Fleet } from "@/pages/Console/screens/Fleet";
import { Agents } from "@/pages/Console/screens/Agents";
import { Vaults } from "@/pages/Console/screens/Vaults";
import { Activity } from "@/pages/Console/screens/Activity";
import { Services } from "@/pages/Console/screens/Services";
import { Analytics } from "@/pages/Console/screens/Analytics";
import { Sdk } from "@/pages/Console/screens/Sdk";

export const router = createBrowserRouter([
  { path: "/", element: <Home /> },
  {
    path: "/console",
    element: <ConsoleLayout />,
    children: [
      { index: true, element: <Fleet /> },
      { path: "agents", element: <Agents /> },
      { path: "vaults", element: <Vaults /> },
      { path: "activity", element: <Activity /> },
      { path: "services", element: <Services /> },
      { path: "analytics", element: <Analytics /> },
      { path: "sdk", element: <Sdk /> },
    ],
  },
]);
