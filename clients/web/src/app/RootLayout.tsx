import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Toaster } from "@/components/Toaster/Toaster";

export function RootLayout() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return; // hash-scroll logic on the target page handles it
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, hash]);

  return (
    <>
      <Outlet />
      {/* Sits at the very root so toasts persist across route changes and
          render above every overlay (drawer, modal, dropdown). */}
      <Toaster />
    </>
  );
}
