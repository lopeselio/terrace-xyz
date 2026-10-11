import { Faq, FinalCta, Footer, Hero, Nav, Story, Trust } from "./components/Site";

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <Story />
      <Trust />
      <Faq />
      <FinalCta />
      <Footer />
    </main>
  );
}
