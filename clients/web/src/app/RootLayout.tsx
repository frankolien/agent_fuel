import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";

export function RootLayout() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return; // hash-scroll logic on the target page handles it
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, hash]);

  return <Outlet />;
}
