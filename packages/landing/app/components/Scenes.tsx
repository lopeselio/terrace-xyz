"use client";
import { AnimatePresence, motion } from "framer-motion";
import { AIBadge, Avatar, Badge, Count, Crest, Header, Odd, Phone, Typed, useScene } from "./AppUI";
import { Icon } from "./Icon";

const ease = [0.22, 1, 0.36, 1] as const;
const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.45, ease } };
const sheetIn = { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" }, transition: { duration: 0.42, ease } };

function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <>
      <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} />
      <motion.div className="sheet" {...sheetIn}>
        <div className="grabber" />
        {children}
      </motion.div>
    </>
  );
}

function Placed({ what, returns }: { what: string; returns: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <motion.div className="tick" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, ease }}>
        <Icon name="check" size={26} />
      </motion.div>
      <div className="sheet-title">Bet placed</div>
      <div className="umeta" style={{ fontSize: 13, marginTop: 4 }}>{what}</div>
      <div className="card" style={{ textAlign: "left", marginTop: 14 }}>
        <div className="kv" style={{ padding: 0 }}><span className="k">Returns if it lands</span><span className="v cond green" style={{ fontSize: 20 }}>{returns}</span></div>
      </div>
    </div>
  );
}

/* ── Hero: in-play match → tap a price → bet slip → placed ─────────────── */
export function HeroScene() {
  const { ref, step } = useScene(4, 2300);
  return (
    <div ref={ref}>
      <Phone
        className="hero-phone"
        header={<Header brand />}
        tab="home"
        overlay={
          <AnimatePresence>
            {step >= 2 && (
              <Sheet key="s">
                {step === 2 ? (
                  <motion.div {...fade}>
                    <div className="eyebrow">Liverpool v Man City · Match result</div>
                    <div className="sheet-title">Liverpool <span className="green">4/6</span></div>
                    <div className="flabel" style={{ marginTop: 16 }}>Stake</div>
                    <div className="field row"><span className="muted" style={{ fontSize: 19, fontWeight: 600 }}>$</span><b style={{ fontSize: 15 }}>10</b></div>
                    <div className="kv" style={{ borderTop: "1px solid var(--line-hair)", marginTop: 12 }}><span className="k">Potential returns</span><span className="v cond green" style={{ fontSize: 22 }}>$16.67</span></div>
                    <span className="cta">Place bet · $10</span>
                  </motion.div>
                ) : (
                  <motion.div {...fade}><Placed what="$10 on Liverpool to win at 4/6" returns="$16.67" /></motion.div>
                )}
              </Sheet>
            )}
          </AnimatePresence>
        }
      >
        <div className="sec">
          <div className="sec-hd"><h3 style={{ color: "var(--red-ink)" }}>In-play now</h3><span className="badge b-min">3 matches</span></div>
          <div className="card">
            <div className="match-top"><Badge cls="b-live">LIVE</Badge><span className="badge b-min">34&apos;</span><span className="match-lg" style={{ marginLeft: "auto" }}>Match result</span></div>
            <div className="match-teams" style={{ margin: "11px 0 12px" }}>
              <div className="team"><Crest code="LIV" /><span className="nm">Liverpool</span><span className="sc">1</span></div>
              <div className="team dim"><Crest code="MCI" /><span className="nm">Man City</span><span className="sc">0</span></div>
            </div>
            <div className="oddsrow"><Odd label="Home" value="4/6" on={step >= 1} /><Odd label="Draw" value="11/4" /><Odd label="Away" value="7/2" /></div>
          </div>
        </div>
        <div className="sec">
          <div className="sec-hd"><h3>Fans are backing</h3></div>
          <div className="card">
            <div className="listrow" style={{ paddingTop: 2 }}>
              <Avatar name="Golden Rabona" i={2} />
              <div style={{ flex: 1 }}><div className="uname">Golden Rabona <span className="muted" style={{ fontWeight: 500 }}>backed</span> Haaland to score</div><div className="umeta">1/3 · $5 stake · 4 min ago</div></div>
              <span className="btn-out">Copy</span>
            </div>
            <div className="listrow" style={{ borderTop: "1px solid var(--line-hair)" }}>
              <Avatar name="The Gaffer" i={1} />
              <div style={{ flex: 1 }}><div className="uname">The Gaffer <AIBadge /> <span className="muted" style={{ fontWeight: 500 }}>backed</span> Over 2.5</div><div className="umeta">8/11 · $2 stake · 9 min ago</div></div>
              <span className="btn-out">Copy</span>
            </div>
          </div>
        </div>
        <AnimatePresence>
          {step === 1 && (
            <motion.div className="slipbar" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.35, ease }}>
              <span className="n">1</span><b>Liverpool to win</b><span className="rt">4/6 <Icon name="chevronRight" size={16} /></span>
            </motion.div>
          )}
        </AnimatePresence>
      </Phone>
    </div>
  );
}

/* ── 1. A take in the chat becomes a market ────────────────────────────── */
export function TakeScene() {
  const { ref, step } = useScene(4, 2400);
  return (
    <div ref={ref}>
      <Phone header={<Header title="Liverpool v Man City" sub="Match chat · 34'" back balance={null} />} tab="markets">
        <div className="sec" style={{ display: "grid", gap: 10 }}>
          <div className="take">
            <div className="take-head"><Avatar name="jamie b" i={2} size={30} /><div><div className="who">jamie.b</div><div className="when">6 min ago</div></div></div>
            <div className="take-text" style={{ fontWeight: 600, fontSize: 15 }}>Anfield is rocking. City can&apos;t get out of their half.</div>
          </div>
          <div className="take">
            <div className="take-head"><Avatar name="The Gaffer" i={1} size={30} /><div><div className="who">The Gaffer</div><div className="when">4 min ago</div></div><div className="badges"><AIBadge /></div></div>
            <div className="take-text" style={{ fontWeight: 600, fontSize: 15 }}>City have had two shots all half. Haaland&apos;s starved of service.</div>
          </div>
          <div className="take">
            <div className="take-head"><Avatar name="Loud Ultra" i={4} size={30} /><div><div className="who">Loud Ultra</div><div className="when">2 min ago</div></div></div>
            <div className="take-text" style={{ fontWeight: 600, fontSize: 15 }}>Mark my words, he&apos;ll still nick one before the break.</div>
          </div>
          <AnimatePresence mode="wait">
            {step === 0 ? (
              <motion.div key="type" {...fade} className="composer">
                <span className="field" style={{ flex: 1, fontSize: 15, fontWeight: 500 }}><Typed text="Haaland scores in the first half" run={step === 0} /></span>
                <span className="send"><Icon name="arrowUpRight" size={18} /></span>
              </motion.div>
            ) : (
              <motion.div key="take" layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }} className={`take${step >= 2 ? " listed" : ""}`}>
                <div className="take-head">
                  <Avatar name="Golden Rabona" i={0} size={30} />
                  <div><div className="who">Golden Rabona</div><div className="when">just now</div></div>
                  {step >= 2 && <div className="badges"><span className="badge b-terrace">Market</span></div>}
                </div>
                <div className="take-text">Haaland scores in the first half</div>
                <AnimatePresence>
                  {step >= 2 && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} transition={{ duration: 0.5, ease }} style={{ overflow: "hidden" }}>
                      <div className="oddsrow two" style={{ marginTop: 6 }}><Odd tone="yes" label="Back · yes" value="1/3" /><Odd tone="no" label="Fade · no" value="3/1" /></div>
                      <div className="settles"><img className="mark" src="/chainlink.png" alt="" /> Yes if Haaland scores before half time, from the official match data.</div>
                      <div className="take-meta" style={{ marginTop: 8 }}>
                        {step === 3 ? <><Count to={12} /> backing · $<Count to={86} /> on it</> : "1 backing · $10 on it"}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                {step === 1 && <div className="take-actions"><span className="cta cta-sm" style={{ width: "auto", padding: "0 16px" }}><Icon name="flame" size={16} /> Make it a market</span><span className="btn-out mute">Back this take</span></div>}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Phone>
    </div>
  );
}

/* ── 2. Swipe your matchday calls ──────────────────────────────────────── */
const DECK = [
  { h: "LIV" as const, a: "MCI" as const, q: "Haaland scores in the first half", y: "1/3", n: "3/1", m: "$86" },
  { h: "ARS" as const, a: "CHE" as const, q: "Arsenal to win", y: "8/13", n: "5/4", m: "$1,240" },
  { h: "RMA" as const, a: "BAR" as const, q: "Both teams to score", y: "4/6", n: "11/10", m: "$410" },
];
function SwipeFace({ c }: { c: (typeof DECK)[number] }) {
  return (
    <>
      <div className="match-top"><span className="badge b-terrace">Terrace</span><Badge cls="b-chainlink" mark="chainlink">Match data</Badge><span className="badge b-flash" style={{ marginLeft: "auto" }}><Icon name="clock" size={12} /> 2h 14m</span></div>
      <div className="deck-hero">
        <div className="row" style={{ gap: 16 }}>
          <div style={{ textAlign: "center" }}><Crest code={c.h} lg /></div>
          <div className="cond" style={{ fontSize: 15, color: "var(--ink-4)" }}>V</div>
          <div style={{ textAlign: "center" }}><Crest code={c.a} lg /></div>
        </div>
      </div>
      <div className="deck-q">{c.q}</div>
      <div className="oddsrow two" style={{ marginTop: 12 }}><Odd tone="yes" label="Back · yes" value={c.y} /><Odd tone="no" label="Fade · no" value={c.n} /></div>
      <div className="kv" style={{ padding: "9px 0 0", borderTop: "1px solid var(--line-hair)", marginTop: 12 }}><span className="k">Matched</span><span className="v">{c.m}</span></div>
    </>
  );
}
export function SwipeScene() {
  const { ref, step } = useScene(6, 1500);
  const round = Math.floor(step / 3); // two cards per loop
  const phase = step % 3; // 0 rest, 1 dragging right, 2 gone + sheet
  const top = DECK[round % DECK.length];
  const next = DECK[(round + 1) % DECK.length];
  return (
    <div ref={ref}>
      <Phone
        header={<Header title="Football" sub="Every call, every match" />}
        tab="markets"
        overlay={
          <AnimatePresence>
            {phase === 2 && (
              <Sheet key={`s${round}`}>
                <Placed what={`$5 on ${top.q} at ${top.y}`} returns={top.y === "1/3" ? "$6.67" : "$8.08"} />
              </Sheet>
            )}
          </AnimatePresence>
        }
      >
        <div style={{ padding: "12px 16px 10px" }}>
          <div className="seg"><span><Icon name="list" size={16} /> List</span><span className="on"><Icon name="cards" size={16} /> Swipe</span></div>
        </div>
        <div className="stage">
          <div className="swipecard under2" />
          <div className="swipecard under"><SwipeFace c={next} /></div>
          <AnimatePresence initial={false}>
            <motion.div
              key={round}
              className="swipecard"
              initial={{ scale: 0.945, y: 13, opacity: 0.5 }}
              animate={phase === 0 ? { x: 0, rotate: 0, scale: 1, y: 0, opacity: 1 } : phase === 1 ? { x: 110, rotate: 7, scale: 1, y: -6, opacity: 1 } : { x: 460, y: -40, rotate: 18, opacity: 0 }}
              transition={{ duration: phase === 2 ? 0.3 : 0.55, ease }}
            >
              <motion.div className="stamp y" animate={{ opacity: phase >= 1 ? 1 : 0 }}>Back</motion.div>
              <div className="stamp n">Fade</div>
              <SwipeFace c={top} />
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="deckacts">
          <span className="act a-no"><Icon name="close" size={26} /></span>
          <span className="act a-skip"><Icon name="arrowDown" /></span>
          <span className="act a-info"><Icon name="info" /></span>
          <motion.span className="act a-yes" animate={{ scale: phase === 1 ? 1.12 : 1 }}><Icon name="check" size={26} /></motion.span>
        </div>
        <div className="deckmeta">18 calls left · swipe left to fade · right to back</div>
      </Phone>
    </div>
  );
}

/* ── 3. Play your mates: copy, fade, 1v1 ───────────────────────────────── */
export function MatesScene() {
  const { ref, step } = useScene(4, 2300);
  const duel = step >= 2;
  return (
    <div ref={ref}>
      <Phone header={<Header title={duel ? "1v1 Matchups" : "The Feed"} sub={duel ? "Head to head with a mate" : "Who is backing what"} back={duel} balance={duel ? "$14.22" : null} />} tab={duel ? "profile" : "social"}>
        <AnimatePresence mode="wait">
          {!duel ? (
            <motion.div key="feed" {...fade} style={{ padding: "12px 16px 0" }}>
              <div className="seg" style={{ marginBottom: 12 }}><span className="on">Following</span><span>Discover</span><span>Leaderboard</span></div>
              <div className="card">
                <div className="listrow" style={{ paddingTop: 2 }}>
                  <Avatar name="mikey d" i={0} />
                  <div style={{ flex: 1 }}><div className="uname">mikeyd <span className="badge b-flash"><Icon name="flame" size={12} /> 6 win streak</span></div><div className="umeta">Backed <b style={{ color: "var(--ink-2)" }}>Arsenal to win</b> at 8/13</div></div>
                  <span className="badge b-open">$20</span>
                </div>
                <div className="oddsrow two" style={{ marginTop: 4 }}><Odd tone="yes" label="Copy this bet" value="8/13" on={step === 1} /><Odd tone="no" label="Fade it" value="5/4" /></div>
                <div className="row" style={{ marginTop: 10, gap: 14 }}><span className="umeta"><Icon name="users" size={12} /> {step === 1 ? 13 : 12} copied</span><span className="umeta">8 min ago</span></div>
              </div>
              <div className="card">
                <div className="listrow" style={{ paddingTop: 2 }}>
                  <Avatar name="saoirse k" i={1} />
                  <div style={{ flex: 1 }}><div className="uname">saoirse.k</div><div className="umeta">Faded <b style={{ color: "var(--ink-2)" }}>Barcelona clean sheet</b> at 11/4</div></div>
                </div>
                <div className="oddsrow two" style={{ marginTop: 4 }}><Odd tone="yes" label="Copy this bet" value="11/4" /><Odd tone="no" label="Fade it" value="1/3" /></div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="duel" {...fade} style={{ padding: "12px 16px 0" }}>
              <div className="flabel">The call</div>
              <div className="field row"><span className="crest-pair"><Crest code="ARS" /><Crest code="CHE" /></span><div style={{ flex: 1 }}><div className="uname">Arsenal to win</div><div className="umeta">Premier League · Sun 16:30</div></div></div>
              <div className="flabel" style={{ marginTop: 14 }}>Your side</div>
              <div className="oddsrow two"><Odd tone="yes" label="Back · yes" value="Yes" on /><Odd tone="no" label="Fade · no" value="No" /></div>
              <div className="umeta" style={{ marginTop: 6 }}>Your mate automatically takes the other side.</div>
              <div className="card" style={{ marginTop: 14 }}>
                <div className="kv flush"><span className="k">You stake</span><span className="v">$5.00</span></div>
                <div className="kv"><span className="k">saoirse.k stakes</span><span className="v">$5.00</span></div>
                <div className="kv" style={{ paddingBottom: 0 }}><span className="k">Winner takes</span><span className="v cond green" style={{ fontSize: 24 }}>$10.00</span></div>
              </div>
              <AnimatePresence mode="wait">
                {step === 3 ? (
                  <motion.div key="sent" {...fade} className="sent"><Icon name="swords" size={18} /> Challenge sent · saoirse.k has until kick-off</motion.div>
                ) : (
                  <motion.span key="cta" {...fade} className="cta" style={{ marginTop: 14 }}><Icon name="swords" size={18} /> Send challenge</motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </Phone>
    </div>
  );
}

/* ── 4. Leagues with a sealed table ────────────────────────────────────── */
const TABLE = [
  { n: "You", i: 0, s: 18, gw: 4 },
  { n: "saoirse.k", i: 1, s: 14, gw: 3 },
  { n: "The Gaffer", i: 3, s: 11, gw: 5, ai: true },
  { n: "jamie.b", i: 2, s: 11, gw: 1 },
];
export function LeagueScene() {
  const { ref, step } = useScene(3, 2600);
  const revealed = step >= 1;
  const rows = revealed ? [...TABLE].sort((a, b) => b.s + b.gw - (a.s + a.gw)) : TABLE;
  return (
    <div ref={ref}>
      <Phone header={<Header title="The Sharp Eleven" sub="Season · gameweek 12" back />} tab="profile">
        <div className="sec">
          <div className="card violet">
            <div className="row">
              <div style={{ flex: 1 }}>
                <div className="eyebrow" style={{ color: "var(--violet-ink)" }}>{revealed ? "Gameweek 12 revealed" : "Gameweek 12 · picks sealed"}</div>
                <AnimatePresence mode="wait">
                  <motion.div key={String(revealed)} {...fade} className="cond" style={{ fontSize: 30, lineHeight: 1.05 }}>
                    {revealed ? <><Count to={4} /> pts</> : "Hidden"}
                  </motion.div>
                </AnimatePresence>
                <div className="umeta">{revealed ? "1st of 4 · 4 points clear" : "Nobody sees picks until the final whistle"}</div>
              </div>
              <Badge cls="b-private" mark="chainlink">Sealed</Badge>
            </div>
          </div>
        </div>
        <div className="sec">
          <div className="sec-hd">
            <h3>Gameweek 12</h3>
            <span style={{ marginLeft: "auto" }}>{revealed ? <Badge cls="b-chainlink" mark="chainlink">Revealed by Chainlink</Badge> : <Badge cls="b-private" icon="lock">Hidden until Sunday</Badge>}</span>
          </div>
          <ul className="board">
            {rows.map((r, k) => (
              <motion.li key={r.n} layout transition={{ duration: 0.6, ease }} className={r.n === "You" ? "me" : undefined}>
                <span className={`pos p${k + 1}`}>{k + 1}</span>
                <Avatar name={r.n === "You" ? "mikey d" : r.n} i={r.i} size={32} />
                <span className="name">{r.n === "You" ? <span className="green">You</span> : r.n} {r.ai && <AIBadge />}<div className="umeta">{r.s} pts this season</div></span>
                <AnimatePresence mode="wait">
                  {revealed ? (
                    <motion.span key="p" {...fade} className="pts"><Count to={r.gw} /><small>GW pts</small></motion.span>
                  ) : (
                    <motion.span key="h" {...fade}><Badge cls="b-private" icon="lock">Hidden</Badge></motion.span>
                  )}
                </AnimatePresence>
              </motion.li>
            ))}
          </ul>
        </div>
      </Phone>
    </div>
  );
}

/* ── 5. AI pundits and Terrace AI ──────────────────────────────────────── */
export function AIScene() {
  const { ref, step } = useScene(4, 2400);
  return (
    <div ref={ref}>
      <Phone header={<Header title="New market" sub="Football only · settles automatically" balance={null} />} tab="create">
        <div style={{ padding: "16px 16px 0" }}>
          <div className="flabel">Your take</div>
          <div className="field" style={{ minHeight: 64, fontSize: 15, fontWeight: 500 }}><Typed text="Salah scores in the second half" run={step === 0} /></div>
          <div className="flabel" style={{ marginTop: 14 }}>Match</div>
          <div className="field row"><span className="crest-pair"><Crest code="LIV" /><Crest code="MCI" /></span><div style={{ flex: 1 }}><div className="uname">Liverpool v Man City</div><div className="umeta">Premier League · Sun 15:30</div></div><Icon name="chevronRight" size={16} /></div>
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="think" {...fade} className="card" style={{ marginTop: 14 }}>
                <div className="row"><span className="ai-orb" /><span className="uname">Terrace AI is reading your take…</span></div>
                <div className="sk" style={{ height: 10, marginTop: 12 }} /><div className="sk" style={{ height: 10, marginTop: 8, width: "70%" }} />
              </motion.div>
            )}
            {step >= 2 && (
              <motion.div key="rule" {...fade} className="card violet" style={{ marginTop: 14 }}>
                <div className="row" style={{ gap: 8 }}><span className="eyebrow" style={{ color: "var(--violet-ink)" }}>How it settles</span><span style={{ marginLeft: "auto" }}><Badge cls="b-chainlink" mark="chainlink">Match data</Badge></span></div>
                <div style={{ fontWeight: 600, fontSize: 14.5, marginTop: 8, lineHeight: 1.4 }}>Yes if Mohamed Salah scores between the 46th minute and full time. Checked against the official match data.</div>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {step === 3 && (
              <motion.div {...fade} className="card" style={{ marginTop: 10 }}>
                <div className="listrow" style={{ padding: 0 }}>
                  <Avatar name="The Gaffer" i={1} />
                  <div style={{ flex: 1 }}><div className="uname">The Gaffer <AIBadge /> backed it</div><div className="umeta">Yes at 6/4 · $2 · just now</div></div>
                  <span className="btn-out">Copy</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Phone>
    </div>
  );
}

/* ── 6. Settled automatically → collect ────────────────────────────────── */
export function SettleScene() {
  const { ref, step } = useScene(4, 2300);
  const won = step >= 2;
  return (
    <div ref={ref}>
      <Phone header={<Header title="mikeyd" sub="Sharp tier · 24 calls" balance={step === 3 ? "$27.55" : "$14.22"} />} tab="profile">
        <div className="sec">
          <AnimatePresence mode="wait">
            <motion.div key={step >= 1 ? "ft" : "live"} {...fade} className={`card ${step >= 1 ? "greenish" : "redish"}`}>
              <div className="match-top">
                {step >= 1 ? <span className="badge b-settled"><Icon name="whistle" size={12} /> Full time</span> : <><Badge cls="b-live">LIVE</Badge><span className="badge b-min">41&apos;</span></>}
                <span className="match-lg" style={{ marginLeft: "auto" }}>Premier League</span>
              </div>
              <div className="row" style={{ justifyContent: "center", gap: 18, marginTop: 10 }}>
                <Crest code="LIV" lg /><span className="cond" style={{ fontSize: 32 }}>{step >= 1 ? "2 – 1" : "1 – 0"}</span><Crest code="MCI" lg />
              </div>
              {step >= 1 && <div className="umeta" style={{ textAlign: "center", marginTop: 8 }}>Haaland 38&apos; · settled by Chainlink from the final score</div>}
            </motion.div>
          </AnimatePresence>
        </div>
        <div style={{ padding: "14px 16px 10px" }}><div className="seg sub"><span className={won ? undefined : "on"}>Open</span><span className={won ? "on" : undefined}>Settled</span><span>Created</span><span>Leagues</span></div></div>
        <div style={{ padding: "0 16px" }}>
          <div className="card">
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div className="uname" style={{ marginBottom: 6 }}>Haaland scores in the first half</div>
                <div className="row" style={{ gap: 6 }}><span className="badge b-terrace">Yes · 1/3</span><span className="badge b-settled">$10 stake</span></div>
              </div>
              <div style={{ textAlign: "right" }}>
                <AnimatePresence mode="wait">
                  <motion.span key={won ? "w" : "o"} {...fade} className={`badge ${won ? "b-won" : "b-flash"}`}>{won ? "Won" : "Open"}</motion.span>
                </AnimatePresence>
                <div className="cond green" style={{ fontSize: 22, marginTop: 6 }}>{won ? <Count to={13.33} prefix="$" decimals={2} /> : "$13.33"}</div>
              </div>
            </div>
            <AnimatePresence>
              {step === 2 && <motion.span {...fade} className="cta cta-sm" style={{ marginTop: 12 }}>Collect $13.33</motion.span>}
            </AnimatePresence>
          </div>
          <AnimatePresence>
            {step === 3 && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.45, ease }} className="won-toast">
                <Icon name="trophy" size={22} /> You won $13.33
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Phone>
    </div>
  );
}

/* ── Flash: an in-play question that locks at the whistle ──────────────── */
const FLASH_CLOCK = ["0:42", "0:31", "Locked", "Settled"];
export function FlashScene() {
  const { ref, step } = useScene(4, 2200);
  return (
    <div ref={ref}>
      <Phone header={<Header title="Flash" sub="In-play · locks at the whistle" />} tab="markets">
        <div className="sec">
          <div className="card redish">
            <div className="match-top"><Badge cls="b-live">LIVE</Badge><span className="badge b-min">{step >= 3 ? "72'" : "63'"}</span><span className="match-lg" style={{ marginLeft: "auto" }}>Premier League</span></div>
            <div className="row" style={{ justifyContent: "center", gap: 18, marginTop: 10 }}>
              <Crest code="ARS" lg /><span className="cond" style={{ fontSize: 30 }}>{step >= 3 ? "2 – 1" : "1 – 1"}</span><Crest code="CHE" lg />
            </div>
          </div>
        </div>
        <div className="sec">
          <div className={`card flash-card${step >= 2 ? " locked" : ""}`}>
            <div className="row" style={{ gap: 8 }}>
              <span className="badge b-flash"><Icon name="bolt" size={12} /> Flash</span>
              <span className="flash-clock" style={{ marginLeft: "auto" }}>
                <Icon name={step >= 2 ? "lock" : "clock"} size={13} />
                <AnimatePresence mode="wait"><motion.span key={step} {...fade}>{FLASH_CLOCK[step]}</motion.span></AnimatePresence>
              </span>
            </div>
            <div className="deck-q" style={{ marginTop: 10 }}>A goal before the 70th minute?</div>
            <div className="flash-bar"><motion.i animate={{ scaleX: [1, 0.74, 0, 0][step] }} transition={{ duration: 2, ease: "linear" }} /></div>
            <div className="oddsrow two" style={{ marginTop: 12 }}><Odd tone="yes" label="Yes" value="6/4" on={step >= 1} /><Odd tone="no" label="No" value="1/2" /></div>
            <AnimatePresence mode="wait">
              {step === 2 && <motion.div key="l" {...fade} className="sent"><Icon name="check" size={16} /> Locked in · $5 on Yes</motion.div>}
              {step === 3 && <motion.div key="w" {...fade} className="won-toast" style={{ position: "static", marginTop: 12 }}><Icon name="trophy" size={20} /> Goal 67&apos; · you won $12.50</motion.div>}
            </AnimatePresence>
          </div>
        </div>
      </Phone>
    </div>
  );
}

/* ── Parlays: stack legs, all must land, the weekly pot ────────────────── */
const LEGS = [
  { h: "LIV" as const, a: "MCI" as const, q: "Liverpool to win", p: 1.67 },
  { h: "RMA" as const, a: "BAR" as const, q: "Both teams to score", p: 1.8 },
  { h: "ATA" as const, a: "INT" as const, q: "Over 2.5 goals", p: 1.62 },
];
export function ParlayScene() {
  const { ref, step } = useScene(4, 2200);
  const n = Math.min(step + 1, 3);
  const combined = LEGS.slice(0, n).reduce((x, l) => x * l.p, 1);
  return (
    <div ref={ref}>
      <Phone header={<Header title="Build a parlay" sub="2-8 legs · all must land" back />} tab="markets">
        <div className="sec" style={{ display: "grid", gap: 8 }}>
          <AnimatePresence initial={false}>
            {LEGS.slice(0, n).map((l) => (
              <motion.div key={l.q} layout initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease }} className="card leg-row">
                <span className="tickbox"><Icon name="check" size={13} /></span>
                <span className="crest-pair"><Crest code={l.h} /><Crest code={l.a} /></span>
                <div style={{ flex: 1, minWidth: 0 }}><div className="uname">{l.q}</div><div className="umeta">Match result · Sat</div></div>
                <span className="cond" style={{ fontSize: 18 }}>{l.p.toFixed(2)}</span>
              </motion.div>
            ))}
          </AnimatePresence>
          <div className="card greenish">
            <div className="kv flush"><span className="k">Combined price</span><span className="v cond green" style={{ fontSize: 24 }}><Count to={combined} decimals={2} /></span></div>
            <div className="kv"><span className="k">Stake</span><span className="v">$10.00</span></div>
            <div className="kv" style={{ paddingBottom: 0 }}><span className="k">This week&apos;s pot</span><span className="v cond" style={{ fontSize: 20 }}>$<Count to={step >= 3 ? 1250 : 1240} /></span></div>
          </div>
          <AnimatePresence mode="wait">
            {step === 3 ? (
              <motion.div key="p" {...fade} className="sent"><Icon name="check" size={16} /> 3-leg parlay placed · in the pot</motion.div>
            ) : (
              <motion.span key="c" {...fade} className="cta">Place parlay · $10</motion.span>
            )}
          </AnimatePresence>
        </div>
      </Phone>
    </div>
  );
}

/* ── Terrace Points: every play counts, founding fans double ────────────── */
const PTS = [
  { r: "Bet placed", p: 20, icon: "dollar" as const },
  { r: "Called it", p: 40, icon: "trophy" as const },
  { r: "3-day streak", p: 60, icon: "flame" as const },
];
export function PointsScene() {
  const { ref, step } = useScene(4, 2100);
  const total = 470 + PTS.slice(0, step).reduce((s, e) => s + e.p, 0);
  return (
    <div ref={ref}>
      <Phone header={<Header title="mikeyd" sub="Sharp tier · 24 calls" />} tab="profile">
        <div className="sec">
          <div className="card points-card">
            <div className="row">
              <div style={{ flex: 1 }}>
                <div className="eyebrow" style={{ color: "var(--amber-ink)" }}>Terrace Points</div>
                <div className="cond" style={{ fontSize: 40, lineHeight: 1 }}><Count to={total} /></div>
                <div className="umeta">Founding fan · every point counts double</div>
              </div>
              <span className="badge b-flash">2×</span>
            </div>
          </div>
        </div>
        <div className="sec" style={{ display: "grid", gap: 8 }}>
          <AnimatePresence initial={false}>
            {PTS.slice(0, step).reverse().map((e) => (
              <motion.div key={e.r} layout initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.45, ease }} className="card row" style={{ gap: 10 }}>
                <span className="pt-icon"><Icon name={e.icon} size={16} /></span>
                <span className="uname" style={{ flex: 1 }}>{e.r}</span>
                <span className="cond" style={{ fontSize: 20, color: "var(--amber-ink)" }}>+{e.p}</span>
              </motion.div>
            ))}
          </AnimatePresence>
          <div className="card row" style={{ gap: 10 }}>
            <Icon name="crown" size={18} />
            <span className="uname" style={{ flex: 1 }}>Leaderboard</span>
            <AnimatePresence mode="wait"><motion.span key={step >= 3 ? "a" : "b"} {...fade} className="cond" style={{ fontSize: 20 }}>#{step >= 3 ? 9 : 14}</motion.span></AnimatePresence>
          </div>
        </div>
      </Phone>
    </div>
  );
}
