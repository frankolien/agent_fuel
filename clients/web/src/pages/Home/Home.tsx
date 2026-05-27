import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Nav } from "@/components/Nav/Nav";
import { Footer } from "@/components/Footer/Footer";
import { Hero } from "./sections/Hero";
import { CategoryStrip } from "./sections/CategoryStrip";
import { Protocol } from "./sections/Protocol";
import { HowItWorks } from "./sections/HowItWorks";
import { Stats } from "./sections/Stats";
import { Sdk } from "./sections/Sdk";
import { Tutorials } from "./sections/Tutorials";
import { Cta } from "./sections/Cta";

export function Home() {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    const tryScroll = () => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    // Delay so the page-in animation has time to commit layout.
    const t = window.setTimeout(tryScroll, 120);
    return () => window.clearTimeout(t);
  }, [hash]);

  return (
    <>
      <div className="bg-fx" aria-hidden="true" />
      <Nav />
      <main className="animate-page-in relative z-[1]">
        <Hero />
        <CategoryStrip />
        <Protocol />
        <HowItWorks />
        <Stats />
        <Sdk />
        <Tutorials />
        <Cta />
        <Footer />
      </main>
    </>
  );
}
