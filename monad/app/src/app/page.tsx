import { FeatureCarousel } from "@/components/FeatureCarousel";
import { Feed } from "@/components/Feed";
import { Trending } from "@/components/Trending";
import { SectionHead } from "@/components/ui";

export default function Home() {
  return (
    <>
      <h1 style={{ fontSize: 26, margin: "4px 0 12px" }}>Back your take.</h1>
      <FeatureCarousel />
      <Trending />
      <SectionHead title="Hottest takes" more="Social" href="/social" />
      <Feed />
    </>
  );
}
