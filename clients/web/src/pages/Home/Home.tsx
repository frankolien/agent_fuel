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
  return (
    <>
      <div className="bg-fx" aria-hidden="true" />
      <Nav />
      <main className="relative z-[1]">
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
