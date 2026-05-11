import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import LiveTicker from "./components/LiveTicker";
import FlashMarkets from "./components/FlashMarkets";
import Reputation from "./components/Reputation";
import ParlayBuilder from "./components/ParlayBuilder";
import Matchups from "./components/Matchups";
import SocialFeed from "./components/SocialFeed";
import CreatorTools from "./components/CreatorTools";
import HowItWorks from "./components/HowItWorks";
import Leagues from "./components/Leagues";
import Waitlist from "./components/Waitlist";
import Footer from "./components/Footer";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#080808] text-white">
      <Navbar />
      <Hero />
      <LiveTicker />
      <FlashMarkets />
      <Reputation />
      <ParlayBuilder />
      <Matchups />
      <SocialFeed />
      <CreatorTools />
      <HowItWorks />
      <Leagues />
      <Waitlist />
      <Footer />
    </main>
  );
}
