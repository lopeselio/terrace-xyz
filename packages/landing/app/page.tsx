import { Faq, Fair, Fans, FinalCta, Footer, Hero, Judges, Nav, Problem, Story } from "./components/Site";

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <Problem />
      <Story />
      <Fair />
      <Fans />
      <Judges />
      <Faq />
      <FinalCta />
      <Footer />
    </main>
  );
}
