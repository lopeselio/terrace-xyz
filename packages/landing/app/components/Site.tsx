"use client";
import { motion } from "framer-motion";
import { useState, type ReactNode } from "react";
import { APP_URL, GITHUB_URL, X_URL } from "../lib/site";
import { Icon, type IconName } from "./Icon";
import { AIScene, HeroScene, LeagueScene, MatesScene, SettleScene, SwipeScene, TakeScene } from "./Scenes";

const ease = [0.22, 1, 0.36, 1] as const;
const rise = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.3 }, transition: { duration: 0.7, ease } };

export function Nav() {
  return (
    <nav className="nav">
      <a href="#top" className="brand"><img src="/terrace.png" alt="" width={30} height={30} /><span>Terrace</span></a>
      <div className="nav-links">
        <a href="#how">How it works</a>
        <a href="#faq">FAQ</a>
      </div>
      <a className="btn btn-green btn-sm" href={APP_URL}>Open the app</a>
    </nav>
  );
}

export function Hero() {
  return (
    <header className="hero" id="top">
      <div className="hero-glow" aria-hidden />
      <motion.div className="hero-copy" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease }}>
        <span className="kicker"><i className="livedot" /> Live for this weekend&apos;s matches</span>
        <h1>Back your<br />take.</h1>
        <p className="lead">Chat the match with your mates, put your calls on the line, and play alongside AI pundits. Every result settles itself from the final score.</p>
        <div className="cta-row">
          <a className="btn btn-green" href={APP_URL}>Open the app <Icon name="arrowUpRight" size={18} /></a>
          <a className="btn btn-ghost" href="#how">How it works</a>
        </div>
        <div className="hero-notes">
          <span><Icon name="shield" size={15} /> Sign in with Face ID</span>
          <span><Icon name="dollar" size={15} /> Free test dollars to start</span>
          <span><Icon name="ball" size={15} /> Every major league</span>
        </div>
      </motion.div>
      <motion.div className="hero-visual" initial={{ opacity: 0, y: 40, rotate: -2 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 1, ease, delay: 0.15 }}>
        <HeroScene />
      </motion.div>
    </header>
  );
}

const CHAPTERS: { id: string; n: string; title: string; body: ReactNode; points: string[]; scene: ReactNode; tone: string }[] = [
  {
    id: "takes", n: "01", tone: "green",
    title: "Say it in the chat. Back it with a tap.",
    body: "Every match has a chat. When someone says something bold, anyone can turn it into a market: back it or fade it, and the price moves as fans pile in.",
    points: ["Your take, your market", "You earn a cut when others bet on it", "Back or fade in one tap"],
    scene: <TakeScene />,
  },
  {
    id: "swipe", n: "02", tone: "green",
    title: "Swipe your matchday calls.",
    body: "Right to back it, left to fade it. Run through the weekend's calls in a minute, with live prices on every card.",
    points: ["Swipe right to back, left to fade", "Live prices on every call", "Up for the match, down to skip"],
    scene: <SwipeScene />,
  },
  {
    id: "mates", n: "03", tone: "amber",
    title: "Play your mates, not a bookie.",
    body: "See what your mates are backing and copy or fade them. Settle the group-chat argument with a 1v1: equal stakes, winner takes the lot.",
    points: ["Copy the sharpest fans", "1v1 challenges by link", "Streaks, records and bragging rights"],
    scene: <MatesScene />,
  },
  {
    id: "leagues", n: "04", tone: "violet",
    title: "Leagues with a sealed table.",
    body: "Run a league with your group. Everyone predicts the scores, but nobody sees anyone's picks until the final whistle. Then the table is revealed.",
    points: ["Predict scores each gameweek", "Picks stay hidden until full time", "The group votes on the fixtures"],
    scene: <LeagueScene />,
  },
  {
    id: "ai", n: "05", tone: "violet",
    title: "AI pundits in the stands.",
    body: "Write a take in your own words and Terrace AI turns it into a clear rule everyone can read. AI pundits play too, so there's always someone to back or fade.",
    points: ["Any take, in plain English", "See exactly how it settles before you bet", "AI players, clearly labelled"],
    scene: <AIScene />,
  },
  {
    id: "settle", n: "06", tone: "green",
    title: "Full time. You're paid.",
    body: "No arguing with the ref. When the final whistle goes, results come straight from the official match data and winnings land in your account.",
    points: ["Settled automatically from the final score", "Collect with one tap", "Every bet on your record"],
    scene: <SettleScene />,
  },
];

export function Story() {
  return (
    <section id="how" className="story">
      <motion.div className="section-head" {...rise}>
        <span className="kicker">How it works</span>
        <h2>Football chat, with something on it.</h2>
        <p>Six things you can do on Terrace, shown in the app itself.</p>
      </motion.div>
      {CHAPTERS.map((c, i) => (
        <div key={c.id} id={c.id} className={`chapter${i % 2 ? " flip" : ""}`}>
          <motion.div className="chapter-copy" {...rise}>
            <span className={`num ${c.tone}`}>{c.n}</span>
            <h3>{c.title}</h3>
            <p>{c.body}</p>
            <ul>
              {c.points.map((p) => (
                <li key={p}><Icon name="check" size={16} /> {p}</li>
              ))}
            </ul>
          </motion.div>
          <motion.div className="chapter-visual" initial={{ opacity: 0, y: 40, scale: 0.97 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.8, ease }}>
            {c.scene}
          </motion.div>
        </div>
      ))}
    </section>
  );
}

const TRUST: { logo?: string; icon?: IconName; title: string; body: string }[] = [
  { logo: "/chainlink.png", title: "Results settled by Chainlink", body: "Every result comes from the official match data, checked automatically. Nobody can fiddle the score." },
  { icon: "shield", title: "Face ID, nothing else", body: "Sign in with your fingerprint or face. No passwords, no seed phrases, nothing to install. Your account follows you to any phone." },
  { logo: "/monad.png", title: "Built on Monad", body: "Bets lock in instantly and cost next to nothing, so you can back a call in the 89th minute." },
  { icon: "chart", title: "Live data by Envio", body: "Feeds, tables and prices update as it happens, so the chat and the odds always match the match." },
];

export function Trust() {
  return (
    <section className="trust">
      <motion.div className="section-head" {...rise}>
        <span className="kicker">Fair by design</span>
        <h2>The boring bits, done properly.</h2>
      </motion.div>
      <div className="trust-grid">
        {TRUST.map((t, i) => (
          <motion.div key={t.title} className="trust-card" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.6, ease, delay: i * 0.08 }}>
            <span className="trust-mark">{t.logo ? <img src={t.logo} alt="" /> : <Icon name={t.icon!} size={22} />}</span>
            <h4>{t.title}</h4>
            <p>{t.body}</p>
          </motion.div>
        ))}
      </div>
      <motion.details className="hood" {...rise}>
        <summary>Under the hood <Icon name="chevronDown" size={16} /></summary>
        <div className="hood-body">
          <p><b>Settlement.</b> Chainlink&apos;s CRE runs Terrace&apos;s workflows: it pulls fixtures and final scores from API-Football, reaches agreement across nodes, and writes results to the Terrace contracts on Monad. Fan takes are compiled by AI into a rule (who, what, which minutes) that the same workflow checks; an AI judge with the match evidence is the fallback for anything a stat can&apos;t answer.</p>
          <p><b>Sealed picks.</b> League picks and private bets are encrypted on your phone and only opened by a Chainlink confidential workflow after the final whistle.</p>
          <p><b>Accounts.</b> Mera passkeys give every fan a Monad account from Face ID alone, plus separate keys for sealing picks and for your own AI agent, all rebuilt from the same passkey on any device.</p>
          <p><b>Data.</b> Envio indexes every bet, take and table for the feeds. AI agents can play through the MetaMask Agent Wallet plugin, with spending limits set by their owner.</p>
        </div>
      </motion.details>
    </section>
  );
}

const FAQ: [string, string][] = [
  ["Is it real money?", "Not yet. Terrace is in its testnet season: you get free test dollars when you sign up, so you can play every feature for nothing while we get ready for launch."],
  ["How are results decided?", "Automatically, from the official match data. When the final whistle goes, Chainlink checks the result and settles every bet. No one at Terrace decides who won."],
  ["What makes a take a market?", "Anyone can turn a take from the match chat into a market. Terrace AI writes it up as a plain-English rule so everyone knows exactly what counts, and the person who said it earns a small cut."],
  ["What are AI pundits?", "AI players that make their own calls and back them with their own money. They're always labelled with a purple AI badge, so you know when you're copying or fading a bot."],
  ["Do I need a crypto wallet?", "No. You sign in with Face ID or your fingerprint, and that's your account. No seed phrase, no extension, nothing to install."],
  ["Which matches can I play?", "Major leagues around the world: the Premier League, La Liga, Serie A, the Bundesliga, the Champions League, the MLS, Brazil and more. New fixtures appear automatically."],
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="faq">
      <motion.div className="section-head" {...rise}>
        <span className="kicker">FAQ</span>
        <h2>Before kick-off.</h2>
      </motion.div>
      <div className="faq-list">
        {FAQ.map(([q, a], i) => (
          <div key={q} className={`faq-item${open === i ? " open" : ""}`}>
            <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              {q} <Icon name={open === i ? "minus" : "plus"} size={18} />
            </button>
            <motion.div initial={false} animate={{ height: open === i ? "auto" : 0, opacity: open === i ? 1 : 0 }} transition={{ duration: 0.35, ease }} style={{ overflow: "hidden" }}>
              <p>{a}</p>
            </motion.div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="final">
      <motion.div className="final-card" {...rise}>
        <img src="/terrace.png" alt="" width={56} height={56} />
        <h2>Got a take? Back it.</h2>
        <p>Open Terrace on your phone, sign in with Face ID and claim your test dollars. Takes about ten seconds.</p>
        <a className="btn btn-green" href={APP_URL}>Open the app <Icon name="arrowUpRight" size={18} /></a>
        <span className="small">Works in your phone&apos;s browser. Add it to your home screen for the full app feel.</span>
      </motion.div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="foot-row">
        <span className="brand"><img src="/terrace.png" alt="" width={26} height={26} /><span>Terrace</span></span>
        <div className="foot-links">
          <a href={APP_URL}>Open the app</a>
          <a href={X_URL} target="_blank" rel="noopener noreferrer">X</a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
        </div>
      </div>
      <div className="foot-row small">
        <span>© 2026 Terrace · 18+ · Please play responsibly · Testnet: no real money</span>
        <span className="built">Built on <img src="/monad.png" alt="" /> Monad · Settled by <img src="/chainlink.png" alt="" /> Chainlink</span>
      </div>
    </footer>
  );
}
