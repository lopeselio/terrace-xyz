"use client";
import { AnimatePresence, motion, useInView, useReducedMotion, useScroll, useSpring } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { APP_URL, GITHUB_URL, X_URL } from "../lib/site";
import { Avatar, Odd, useScene } from "./AppUI";
import { Icon, type IconName } from "./Icon";
import { CountUp, Reveal, SPRING, Words } from "./Motion";
import { AIScene, FlashScene, HeroScene, LeagueScene, MatesScene, ParlayScene, PointsScene, SettleScene, SwipeScene, TakeScene } from "./Scenes";

/* ── Nav + scroll progress ─────────────────────────────────────────────── */
export function Nav() {
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 170, damping: 26 });
  return (
    <nav className="nav">
      <a href="#top" className="brand"><img src="/terrace.png" alt="" width={30} height={30} /><span>Terrace</span></a>
      <div className="nav-links">
        <a href="#how">How it works</a>
        <a href="#fair">Fair play</a>
        <a href="#judges">Judges &amp; investors</a>
        <a href="#faq">FAQ</a>
      </div>
      <a className="btn btn-green btn-sm" href={APP_URL}>Open the app</a>
      <motion.i className="nav-progress" style={{ scaleX: progress }} aria-hidden />
    </nav>
  );
}

/* ── Hero ──────────────────────────────────────────────────────────────── */
export function Hero() {
  const reduce = useReducedMotion();
  return (
    <header className="hero" id="top">
      <div className="hero-glow" aria-hidden />
      <div className="hero-copy">
        <Reveal y={12}><span className="kicker"><i className="livedot" /> Live for this weekend&apos;s matches</span></Reveal>
        <Words as="h1" text={"Back your\ntake."} accent={["take"]} delay={0.1} />
        <Reveal delay={0.35}>
          <p className="lead">Every football group chat is full of calls. Terrace lets you put something on yours: your mates back you or fade you, AI pundits join in, and the real match result settles it automatically.</p>
        </Reveal>
        <Reveal delay={0.45}>
          <div className="cta-row">
            <a className="btn btn-green" href={APP_URL}>Open the app <Icon name="arrowUpRight" size={18} /></a>
            <a className="btn btn-ghost" href="#why">See how it works</a>
          </div>
        </Reveal>
        <Reveal delay={0.55}>
          <div className="hero-notes">
            <span><Icon name="shield" size={15} /> Sign in with Face ID</span>
            <span><Icon name="dollar" size={15} /> Free test dollars to start</span>
            <span><Icon name="ball" size={15} /> 19 leagues worldwide</span>
          </div>
        </Reveal>
      </div>
      <motion.div className="hero-visual" initial={reduce ? false : { opacity: 0, y: 60, rotate: -3 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ ...SPRING.heavy, delay: 0.2 }}>
        <HeroScene />
      </motion.div>
      <a href="#why" className="scroll-cue" aria-label="Scroll down"><motion.span animate={reduce ? undefined : { y: [0, 6, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}><Icon name="arrowDown" size={18} /></motion.span></a>
    </header>
  );
}

/* ── The problem: the chat already has a market ────────────────────────── */
const CHAT = [
  { who: "jamie.b", i: 2, text: "City look shaky at the back today" },
  { who: "Loud Ultra", i: 4, text: "Haaland scores before half-time. Guaranteed.", bold: true },
  { who: "saoirse.k", i: 1, text: "No chance. Fiver says he doesn't." },
];

function ChatToMarket() {
  // 0-2 bubbles arrive one at a time · 3 the bold one lifts · 4 it becomes a market · 5 mates pile in
  const { ref, step } = useScene(7, 1300);
  const s = Math.min(step, 5);
  return (
    <div ref={ref} className="c2m">
      <div className="c2m-head"><span className="livedot" /> Match chat · Liverpool v Man City</div>
      <div className="c2m-body">
        {CHAT.map((c, k) => {
          if (s < k) return null;
          const lifted = c.bold && s >= 3;
          if (c.bold && s >= 4) {
            return (
              <motion.div key="market" layoutId="take" transition={SPRING.base} className="c2m-market">
                <div className="row" style={{ gap: 8 }}>
                  <Avatar name={c.who} i={c.i} size={26} />
                  <b>{c.who}</b>
                  <span className="badge b-terrace" style={{ marginLeft: "auto" }}>Market</span>
                </div>
                <motion.div layoutId="take-text" className="c2m-text">{c.text}</motion.div>
                <div className="oddsrow two"><Odd tone="yes" label="Back" value="1/3" on={s >= 5} /><Odd tone="no" label="Fade" value="3/1" /></div>
                <div className="settles"><img className="mark" src="/chainlink.png" alt="" /> Settles from the official match data</div>
                <AnimatePresence>
                  {s >= 5 && <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={SPRING.snappy} className="umeta">12 mates in · $86 on it</motion.div>}
                </AnimatePresence>
              </motion.div>
            );
          }
          return (
            <motion.div
              key={c.who}
              layoutId={c.bold ? "take" : undefined}
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: lifted ? 1.04 : 1 }}
              transition={SPRING.snappy}
              className={`c2m-bubble${lifted ? " lifted" : ""}`}
            >
              <Avatar name={c.who} i={c.i} size={26} />
              <div><b>{c.who}</b><motion.div layoutId={c.bold ? "take-text" : undefined}>{c.text}</motion.div></div>
              {lifted && <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={SPRING.snappy} className="c2m-btn"><Icon name="flame" size={14} /> Make it a market</motion.span>}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

const PAINS: { before: string; after: string; icon: IconName }[] = [
  { before: "Betting apps make you play the bookmaker, and the house always takes its cut.", after: "On Terrace you play other fans. The crowd sets the price.", icon: "users" },
  { before: "You can only bet on what the bookie offers, not what your mates are arguing about.", after: "Any take from the chat can become a market in one tap.", icon: "flame" },
  { before: "Fantasy football is picked once a week and goes quiet during the match.", after: "Flash questions and live takes keep every minute alive.", icon: "bolt" },
  { before: "\"Loser buys the drinks\" relies on trust, and nobody ever pays up.", after: "Results settle automatically. Winners are paid, every time.", icon: "trophy" },
  { before: "Crypto apps want seed phrases, wallets and confusing pop-ups.", after: "Face ID to sign in. No wallet, no pop-ups, no jargon.", icon: "shield" },
];

export function Problem() {
  return (
    <section className="problem" id="why">
      <div className="problem-top">
        <div>
          <Reveal y={12}><span className="kicker">The problem</span></Reveal>
          <Words text={"The group chat\nalready has a market."} accent={["market"]} />
          <Reveal delay={0.2}>
            <p className="section-lead">Every match, millions of fans make calls in group chats. Somebody disagrees, the match ends, and nothing happens. Nobody keeps score of who was right, and nothing is ever on the line.</p>
          </Reveal>
          <Reveal delay={0.3}>
            <p className="section-lead strong">Terrace turns that argument into the game.</p>
          </Reveal>
        </div>
        <Reveal delay={0.15}><ChatToMarket /></Reveal>
      </div>
      <div className="pains">
        {PAINS.map((p, i) => (
          <Reveal key={p.before} delay={i * 0.08} className="pain">
            <span className="pain-icon"><Icon name={p.icon} size={18} /></span>
            <p className="pain-before">{p.before}</p>
            <p className="pain-after"><Icon name="check" size={15} /> {p.after}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ── How it works: one phone, nine screens, three acts ─────────────────── */
type Chapter = { id: string; act: string; title: string; body: ReactNode; points: string[]; scene: () => ReactNode };
const CHAPTERS: Chapter[] = [
  {
    id: "takes", act: "In the match",
    title: "Say it in the chat. Back it with a tap.",
    body: "Every match has a live chat. When someone says something bold, anyone can turn it into a market. Terrace writes it up as a clear rule, and fans back it or fade it.",
    points: ["Your take, your market", "You earn a cut when others bet on it", "Back or fade in one tap"],
    scene: () => <TakeScene />,
  },
  {
    id: "flash", act: "In the match",
    title: "Flash: the next ten minutes.",
    body: "Quick questions that open during the game and lock at the whistle. A goal before the 70th? A card in the next five? Answer fast, find out fast.",
    points: ["Only while the match is live", "A countdown on every question", "Settled minutes later"],
    scene: () => <FlashScene />,
  },
  {
    id: "swipe", act: "In the match",
    title: "Swipe through the weekend.",
    body: "Right to back it, left to fade it. Run through every call on the weekend's matches in a minute, with live prices on every card.",
    points: ["Swipe right to back, left to fade", "Live prices on every call", "Up for the match chat, down to skip"],
    scene: () => <SwipeScene />,
  },
  {
    id: "mates", act: "With your mates",
    title: "Play your mates, not a bookie.",
    body: "Follow the sharpest fans and copy or fade their bets. Settle the group-chat argument with a 1v1: equal stakes, sent as a link, winner takes the lot.",
    points: ["Copy or fade any fan", "1v1 challenges by WhatsApp link", "Share every win"],
    scene: () => <MatesScene />,
  },
  {
    id: "leagues", act: "With your mates",
    title: "Leagues with a sealed table.",
    body: "Run a league with your group, like fantasy but for scores. Everyone predicts each gameweek, and nobody can see anyone's picks until kick-off. Then the table moves.",
    points: ["Predict scores each gameweek", "Picks stay sealed so nobody copies", "Members vote on which matches count"],
    scene: () => <LeagueScene />,
  },
  {
    id: "parlays", act: "Your season",
    title: "Parlays: stack your calls.",
    body: "Combine 2 to 8 picks across different matches. Every leg has to land, and everyone who gets theirs right shares the week's pot.",
    points: ["2 to 8 legs, any leagues", "One stake, a bigger payout", "A fresh pot every week"],
    scene: () => <ParlayScene />,
  },
  {
    id: "ai", act: "Your season",
    title: "AI pundits in the stands.",
    body: "Write a take in your own words and Terrace reads it back as a plain-English rule before you bet. AI pundits make their own calls too, so there's always someone to take on.",
    points: ["Any take, in your own words", "See exactly how it settles first", "AI players always wear an AI badge"],
    scene: () => <AIScene />,
  },
  {
    id: "points", act: "Your season",
    title: "Every call counts.",
    body: "Earn Terrace Points for playing, calling it right, keeping a streak and bringing your mates. Climb the leaderboard and build a record that's yours.",
    points: ["Points for every play", "Streaks and a public record", "Founding fans earn double until 1 November"],
    scene: () => <PointsScene />,
  },
  {
    id: "settle", act: "Full time",
    title: "Full time. You're paid.",
    body: "No arguing with the ref. When the final whistle goes, the result comes straight from the official match data and your winnings are ready to collect.",
    points: ["Settled automatically", "Collect with one tap", "Every bet on your record"],
    scene: () => <SettleScene />,
  },
];

function useActiveChapter(n: number) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(Number((e.target as HTMLElement).dataset.i))),
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.slice(0, n).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [n]);
  return { refs, active };
}

export function Story() {
  const { refs, active } = useActiveChapter(CHAPTERS.length);
  const prev = useRef(0);
  const dir = active >= prev.current ? 1 : -1;
  useEffect(() => { prev.current = active; }, [active]);
  const reduce = useReducedMotion();

  return (
    <section id="how" className="story">
      <div className="section-head">
        <Reveal y={12}><span className="kicker">How it works</span></Reveal>
        <Words text={"Football chat,\nwith something on it."} accent={["something"]} />
        <Reveal delay={0.2}><p>Nine things you can do on Terrace, shown in the app itself. Scroll through a matchday.</p></Reveal>
      </div>

      <div className="story-grid">
        <ol className="story-rail" aria-hidden>
          {CHAPTERS.map((c, i) => (
            <li key={c.id} className={i === active ? "on" : i < active ? "done" : undefined}>
              <span>{String(i + 1).padStart(2, "0")}</span>
            </li>
          ))}
        </ol>

        <div className="story-chapters">
          {CHAPTERS.map((c, i) => (
            <div key={c.id} id={c.id} data-i={i} ref={(el) => { refs.current[i] = el; }} className={`chapter${i === active ? " active" : ""}`}>
              {(i === 0 || CHAPTERS[i - 1].act !== c.act) && <span className="act-label">{c.act}</span>}
              <span className="num">{String(i + 1).padStart(2, "0")}</span>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
              <ul>
                {c.points.map((p) => (
                  <li key={p}><Icon name="check" size={16} /> {p}</li>
                ))}
              </ul>
              <div className="chapter-inline">{c.scene()}</div>
            </div>
          ))}
        </div>

        <div className="story-stage" aria-hidden>
          <div className="stage-sticky">
            <AnimatePresence mode="popLayout" initial={false} custom={dir}>
              <motion.div
                key={active}
                custom={dir}
                initial={reduce ? false : { opacity: 0, y: dir * 70, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? undefined : { opacity: 0, y: dir * -70, scale: 0.97 }}
                transition={{ ...SPRING.base, opacity: { duration: 0.25 } }}
              >
                {CHAPTERS[active].scene()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Fair play: who decides who won ────────────────────────────────────── */
const PIPE: { icon?: IconName; logo?: string; title: string; body: string }[] = [
  { icon: "whistle", title: "Final whistle", body: "The official match data: goals, cards, shots, every minute." },
  { logo: "/chainlink.png", title: "Chainlink checks it", body: "Independent computers fetch the result separately and must all agree." },
  { logo: "/monad.png", title: "Written on Monad", body: "The result is recorded where nobody, including us, can change it." },
  { icon: "wallet", title: "You collect", body: "Winnings are ready in your account. One tap and they're yours." },
];

function Pipeline() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.25 });
  const reduce = useReducedMotion();
  const on = inView || reduce;
  return (
    <div ref={ref} className="pipe">
      {PIPE.map((p, i) => (
        <div key={p.title} className="pipe-step">
          {i > 0 && (
            <span className="pipe-line" aria-hidden>
              <motion.i initial={{ scale: 0 }} animate={on ? { scale: 1 } : undefined} transition={{ duration: 0.55, delay: i * 0.6 - 0.35, ease: [0.65, 0, 0.35, 1] }} />
            </span>
          )}
          <motion.span className="pipe-node" initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={on ? { scale: 1, opacity: 1 } : undefined} transition={{ ...SPRING.snappy, delay: i * 0.6 }}>
            {p.logo ? <img src={p.logo} alt="" /> : <Icon name={p.icon!} size={24} />}
          </motion.span>
          <motion.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={on ? { opacity: 1, y: 0 } : undefined} transition={{ ...SPRING.base, delay: i * 0.6 + 0.1 }}>
            <h4>{p.title}</h4>
            <p>{p.body}</p>
          </motion.div>
        </div>
      ))}
    </div>
  );
}

const FAIR: { icon: IconName; title: string; body: string }[] = [
  { icon: "eye", title: "You see the rule first", body: "AI helps turn your words into a precise rule, then Terrace shows it back to you in plain English, written by code rather than the AI. What you agree to is exactly what gets checked." },
  { icon: "refresh", title: "Unclear? Everyone's refunded", body: "Postponed match, or a take nobody can fairly decide? Every stake goes back. For odd takes, an AI judge looks at the match evidence, and if it isn't sure, nobody loses." },
  { icon: "lock", title: "Sealed picks stay sealed", body: "Hidden picks are locked on your phone and opened at kick-off inside secure hardware. Each one is checked against what you originally locked in, so nobody can change a pick afterwards." },
];

export function Fair() {
  return (
    <section className="fair" id="fair">
      <div className="section-head">
        <Reveal y={12}><span className="kicker">Fair play</span></Reveal>
        <Words text={"Who decides who won?\nNot us."} accent={["Not", "us."]} />
        <Reveal delay={0.2}><p>Every market on Terrace is settled by Chainlink, the independent network big finance apps already rely on for real-world data. Terrace can&apos;t pick the winner, and neither can the person who made the call.</p></Reveal>
      </div>
      <Pipeline />
      <div className="fair-grid">
        {FAIR.map((f, i) => (
          <Reveal key={f.title} delay={i * 0.08} className="fair-card">
            <span className="trust-mark"><Icon name={f.icon} size={20} /></span>
            <h4>{f.title}</h4>
            <p>{f.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ── Built for fans, not crypto experts ────────────────────────────────── */
const PROMISES = [
  "Sign in with Face ID or your fingerprint",
  "No seed phrase, no wallet to install",
  "No pop-ups asking you to approve or sign",
  "Free test dollars the moment you join",
  "New phone? Same passkey, same account",
  "Football words only. No crypto jargon",
];

function FaceId() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.6 });
  const reduce = useReducedMotion();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!inView) return setDone(false);
    if (reduce) return setDone(true);
    const t = setTimeout(() => setDone(true), 1600);
    return () => clearTimeout(t);
  }, [inView, reduce]);
  return (
    <div ref={ref} className="faceid">
      <svg viewBox="0 0 120 120" width="148" height="148" aria-hidden>
        {/* corners */}
        {["M14 38V22a8 8 0 0 1 8-8h16", "M82 14h16a8 8 0 0 1 8 8v16", "M106 82v16a8 8 0 0 1-8 8H82", "M38 106H22a8 8 0 0 1-8-8V82"].map((d) => (
          <motion.path key={d} d={d} fill="none" stroke={done ? "var(--green)" : "var(--ink-2)"} strokeWidth="5" strokeLinecap="round" />
        ))}
        <AnimatePresence mode="wait">
          {done ? (
            <motion.path key="tick" d="M38 61l15 15 30-32" fill="none" stroke="var(--green)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.45, ease: [0.65, 0, 0.35, 1] }} />
          ) : (
            <motion.g key="face" exit={{ opacity: 0 }} stroke="var(--ink-2)" strokeWidth="5" strokeLinecap="round" fill="none">
              <path d="M44 46v6M76 46v6M60 46v18h-5M47 80c8 6 18 6 26 0" />
            </motion.g>
          )}
        </AnimatePresence>
        {!done && inView && !reduce && (
          <motion.rect x="14" width="92" height="3" rx="1.5" fill="var(--green)" initial={{ y: 18, opacity: 0 }} animate={{ y: [18, 100, 18], opacity: [0, 1, 0] }} transition={{ duration: 1.5, ease: "easeInOut" }} />
        )}
      </svg>
      <div className="faceid-label">
        <AnimatePresence mode="wait">
          <motion.span key={String(done)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={SPRING.snappy}>
            {done ? "You're in. $100 in test dollars added." : "Signing in with Face ID…"}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}

export function Fans() {
  return (
    <section className="fans">
      <div className="fans-card">
        <div>
          <Reveal y={12}><span className="kicker">Built for fans</span></Reveal>
          <Words text={"No crypto degree\nrequired."} accent={["required."]} />
          <Reveal delay={0.15}><p className="section-lead">If you can use WhatsApp, you can use Terrace. It opens in your phone&apos;s browser, and there&apos;s nothing to install.</p></Reveal>
          <ul className="promises">
            {PROMISES.map((p, i) => (
              <Reveal as="li" key={p} delay={0.2 + i * 0.07}><span className="tickbox"><Icon name="check" size={13} /></span> {p}</Reveal>
            ))}
          </ul>
        </div>
        <Reveal delay={0.1}><FaceId /></Reveal>
      </div>
    </section>
  );
}

/* ── For judges and investors ──────────────────────────────────────────── */
const STATS: { n: number; suffix?: string; label: string }[] = [
  { n: 19, label: "football leagues, fixtures scheduled automatically" },
  { n: 10, label: "smart contracts live on Monad testnet" },
  { n: 3, label: "Chainlink workflows settle every result" },
  { n: 69, label: "contract tests passing" },
  { n: 0, label: "seed phrases, pop-ups or gas fees for fans" },
];

const STACK: { name: string; logo?: string; mark?: string; wordmark?: string; icon?: IconName; fan: string; tech: string }[] = [
  { name: "Monad", logo: "/monad.png", fan: "Bets lock in instantly and cost next to nothing, so you can back a call in the 89th minute.", tech: "Every bet, take, pick, chat message and follow is a Monad transaction across 10 contracts." },
  { name: "Chainlink CRE", logo: "/chainlink.png", fan: "The independent referee. Nobody at Terrace decides who won.", tech: "Three workflows: settlement (fixtures + scores), questions (rule engine + AI judge) and reveal (sealed picks in a TEE via handlerInTee)." },
  { name: "Mera", icon: "shield", fan: "Face ID is your whole account, on any phone.", tech: "Passkey accounts from Category Labs. One passkey ceremony derives the account, sealing, agent and agent-memory keys with HKDF; signing sessions remove pop-ups." },
  { name: "Envio", wordmark: "/envio.png", fan: "Feeds, tables and points update as it happens.", tech: "HyperIndex indexes every contract event into the feed, leaderboards, notifications and Terrace Points." },
  { name: "Alchemy", wordmark: "/alchemy.png", fan: "Fast and reliable behind the scenes.", tech: "RPC for the app's servers, the CRE workflows and the AI agents." },
  { name: "MetaMask Agent Wallet", mark: "/metamask.svg", fan: "Your own AI can play Terrace for you.", tech: "terrace-mm-plugin: find value, back or fade takes, list takes, accept 1v1s and collect, inside the wallet's own policies." },
  { name: "Circle USDC", icon: "dollar", fan: "Play with test dollars or digital dollars.", tech: "Stakes settle in Terrace test dollars or Circle's testnet USDC." },
];

export function Judges() {
  return (
    <section className="judges" id="judges">
      <div className="section-head">
        <Reveal y={12}><span className="kicker">For judges &amp; investors</span></Reveal>
        <Words text={"A consumer app\non serious rails."} accent={["serious"]} />
        <Reveal delay={0.2}><p>Fans see a football app. Underneath, every bet is recorded on Monad and every result is settled by Chainlink, so the app can grow without anyone having to trust Terrace with the outcome.</p></Reveal>
      </div>

      <div className="stats">
        {STATS.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.06} className="stat">
            <b className="cond"><CountUp to={s.n} suffix={s.suffix} /></b>
            <span>{s.label}</span>
          </Reveal>
        ))}
      </div>

      <div className="stack">
        {STACK.map((s, i) => (
          <Reveal key={s.name} delay={(i % 3) * 0.07} className="stack-card">
            <div className="row stack-head" style={{ gap: 12 }}>
              {s.wordmark ? (
                <img className="stack-wordmark" src={s.wordmark} alt={s.name} />
              ) : (
                <>
                  <span className="trust-mark">{s.logo ? <img src={s.logo} alt="" /> : s.mark ? <img className="contain" src={s.mark} alt="" /> : <Icon name={s.icon!} size={20} />}</span>
                  <h4>{s.name}</h4>
                </>
              )}
            </div>
            <p className="stack-fan">{s.fan}</p>
            <p className="stack-tech">{s.tech}</p>
          </Reveal>
        ))}
      </div>

      <div className="model">
        <Reveal className="model-card">
          <span className="kicker">How Terrace grows</span>
          <h3>Every market is born in a chat and shared as a link.</h3>
          <p>Takes start in match rooms, 1v1s travel by WhatsApp, and leagues spread through invite codes. Every one of those links brings the next fan in, and inviting a mate earns Terrace Points.</p>
        </Reveal>
        <Reveal className="model-card" delay={0.08}>
          <span className="kicker">How it earns</span>
          <div className="model-row"><span className="badge b-terrace">Today</span><p>The fan who makes a take earns up to 5% of the winners&apos; profit on it, so the people who start the conversation get paid for it.</p></div>
          <div className="model-row"><span className="badge b-flash">Planned</span><p>A platform share of each market at mainnet launch, and premium leagues for clubs, pubs and creators.</p></div>
        </Reveal>
      </div>

      <Reveal className="judge-links">
        <a className="btn btn-green" href={APP_URL}>Try the live app <Icon name="arrowUpRight" size={18} /></a>
        <a className="btn btn-ghost" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">Read the code on GitHub <Icon name="arrowUpRight" size={18} /></a>
      </Reveal>
    </section>
  );
}

/* ── FAQ ───────────────────────────────────────────────────────────────── */
const FAQ: [string, string][] = [
  ["Is it real money?", "Not yet. Terrace is in its testnet season: you get free test dollars when you sign up, so you can play every feature for nothing while we get ready for launch."],
  ["How are results decided?", "Automatically, from the official match data. When the final whistle goes, Chainlink checks the result and settles every bet. No one at Terrace decides who won."],
  ["What makes a take a market?", "Anyone can turn a take from the match chat into a market. Terrace writes it up as a plain-English rule so everyone knows exactly what counts, and the person who said it earns a small cut."],
  ["What happens if a match is called off?", "Every stake on it goes back to the person who placed it. The same goes for any take that can't be fairly decided."],
  ["What are AI pundits?", "AI players that make their own calls and back them with their own money. They always wear an AI badge, so you know when you're copying or fading a bot. With the MetaMask plugin, you can even bring your own."],
  ["Do I need a crypto wallet?", "No. You sign in with Face ID or your fingerprint, and that's your account. No seed phrase, no extension, nothing to install."],
  ["Which matches can I play?", "19 leagues around the world, including the Premier League, La Liga, Serie A, the Bundesliga, the Champions League, the MLS and Brazil. New fixtures appear automatically."],
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="faq">
      <div className="section-head">
        <Reveal y={12}><span className="kicker">FAQ</span></Reveal>
        <Words text="Before kick-off." />
      </div>
      <div className="faq-list">
        {FAQ.map(([q, a], i) => (
          <Reveal key={q} delay={i * 0.04} className={`faq-item${open === i ? " open" : ""}`}>
            <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
              {q} <motion.span animate={{ rotate: open === i ? 45 : 0 }} transition={SPRING.snappy} style={{ display: "inline-flex" }}><Icon name="plus" size={18} /></motion.span>
            </button>
            <motion.div initial={false} animate={{ height: open === i ? "auto" : 0, opacity: open === i ? 1 : 0 }} transition={SPRING.base} style={{ overflow: "hidden" }}>
              <p>{a}</p>
            </motion.div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ── Final CTA + footer ────────────────────────────────────────────────── */
export function FinalCta() {
  return (
    <section className="final">
      <Reveal className="final-card">
        <img src="/terrace.png" alt="" width={56} height={56} />
        <Words text="Got a take? Back it." accent={["Back"]} />
        <p>Open Terrace on your phone, sign in with Face ID and claim your test dollars. It takes about ten seconds.</p>
        <a className="btn btn-green" href={APP_URL}>Open the app <Icon name="arrowUpRight" size={18} /></a>
        <span className="small">Works in your phone&apos;s browser. Add it to your home screen for the full app feel.</span>
      </Reveal>
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

