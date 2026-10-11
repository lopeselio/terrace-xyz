/* Terrace — screens part 2: create, social, profile, leagues, onboarding, loaders */

/* ── CREATE ───────────────────────────────────────────────────────────── */
SCREENS.create = () => `
${header({title:'New market', sub:'Football only · settles automatically', bal:null, actions:[]})}
<div class="scroll" style="padding:16px var(--gutter) 90px">
  <div class="flabel">The question</div>
  <div class="field"><textarea placeholder="e.g. Will Arsenal beat Chelsea on Sunday?"></textarea></div>
  <div class="row" style="justify-content:space-between;margin-top:6px"><span class="umeta">Keep it settleable from the final score.</span><span class="umeta">0 / 140</span></div>

  <div class="flabel" style="margin-top:20px">Match</div>
  <button class="field row" style="width:100%;text-align:left">
    <div style="display:flex">${crest('ARS')}<div style="margin-left:-9px">${crest('CHE')}</div></div>
    <div style="flex:1"><div style="font-size:14px;font-weight:600">Arsenal v Chelsea</div><div class="umeta">Premier League · Sun 16:30</div></div>
    ${ic('chevronRight','i-16')}
  </button>

  <div class="flabel" style="margin-top:20px">Closes</div>
  <div class="seg sub"><button>1 hour</button><button>4 hours</button><button class="on">Kick-off</button><button>Full time</button></div>

  <div class="flabel" style="margin-top:20px">Your cut</div>
  <div class="card" style="padding:14px">
    <div class="row"><span style="flex:1;font-size:13.5px;color:var(--ink-2)">Creator fee</span><span style="font-family:var(--cond);font-size:24px;font-weight:700;color:var(--green)">1.0%</span></div>
    <div style="height:4px;border-radius:2px;background:#242424;margin-top:12px;position:relative"><i style="position:absolute;left:0;top:0;bottom:0;width:20%;background:var(--green);border-radius:2px"></i><i style="position:absolute;left:20%;top:-6px;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:var(--green);border:3px solid #0f0f0f"></i></div>
    <div class="row" style="justify-content:space-between;margin-top:8px"><span class="umeta">0%</span><span class="umeta">5% max</span></div>
  </div>

  <div class="flabel" style="margin-top:20px">Options</div>
  <div class="card" style="padding:4px 14px">
    <div class="kv" style="border-bottom:1px solid var(--line-hair)">
      <div><div class="v">Flash market</div><div class="umeta">Opens in-match, 15–90 min window</div></div>
      <div class="switch"><i></i></div>
    </div>
    <div class="kv">
      <div><div class="v">Private league only <span class="badge b-private" style="margin-left:4px">${ic('lock','i-14')} Arcium</span></div><div class="umeta">Positions hidden until the whistle</div></div>
      <div class="switch on"><i></i></div>
    </div>
  </div>
</div>
<div style="position:absolute;left:10px;right:10px;bottom:calc(var(--tabbar-h) + 24px);z-index:7"><button class="cta">Publish market</button></div>
${tabbar('create')}`;

/* ── SOCIAL ───────────────────────────────────────────────────────────── */
const fanRow = (initials, colour, name, meta, state) => `
<div class="listrow">
  <div class="avatar" style="background:${colour}">${initials}</div>
  <div style="flex:1"><div class="uname">${name}</div><div class="umeta">${meta}</div></div>
  <button class="btn-out ${state==='following'?'on':''}">${state==='following'?'Following':'Follow'}</button>
</div>`;

SCREENS.social = () => `
${header({title:'The Feed', sub:'Who is backing what', bal:null, actions:['search']})}
<div style="padding:12px var(--gutter) 10px"><div class="seg"><button class="on">Following</button><button>Discover</button><button>Leaderboard</button></div></div>
<div class="scroll" style="padding:4px var(--gutter) 0">
  <div class="card">
    <div class="listrow" style="padding-top:2px">
      <div class="avatar" style="background:#1d4ed8">MD</div>
      <div style="flex:1"><div class="uname">mikeyd</div><div class="umeta">Backed <b style="color:var(--ink-2)">Arsenal to win</b> at 4/9</div></div>
      <span class="badge b-open">£20</span>
    </div>
    <div class="oddsrow two" style="margin-top:4px">${odd('Copy this bet','4/9','odd-yes')}${odd('Fade it','5/4','odd-no')}</div>
    <div class="row" style="margin-top:10px;gap:14px"><span class="umeta">${ic('users','i-14')} 12 copied</span><span class="umeta">8 min ago</span></div>
  </div>
  <div class="card">
    <div class="listrow" style="padding-top:2px">
      <div class="avatar" style="background:#7c2d12">SK</div>
      <div style="flex:1"><div class="uname">saoirse.k <span class="badge b-flash">${ic('flame','i-14')} 6 win streak</span></div><div class="umeta">Faded <b style="color:var(--ink-2)">Barcelona clean sheet</b> at 11/4</div></div>
    </div>
    <div class="oddsrow two" style="margin-top:4px">${odd('Copy this bet','11/4','odd-yes')}${odd('Fade it','1/3','odd-no')}</div>
  </div>
  <div class="sec" style="padding:18px 0 0">
    <div class="sec-hd"><h3>People to follow</h3></div>
    <div class="card" style="padding:4px 14px">
      ${fanRow('JB','#166534','jamie.b','78% win rate · 46 bets','follow')}
      ${fanRow('AT','#4c1d95','arsenal_tom','71% win rate · 132 bets','following')}
      ${fanRow('RN','#831843','rednev','69% win rate · 88 bets','follow')}
    </div>
  </div>
  <div style="height:18px"></div>
</div>
${tabbar('social')}`;

/* ── PROFILE ──────────────────────────────────────────────────────────── */
const betRow = (q, side, odds, stake, ret, state) => `
<div class="card card-tap">
  <div class="row" style="align-items:flex-start">
    <div style="flex:1"><div style="font-size:14px;font-weight:600;margin-bottom:6px">${q}</div>
    <div class="row" style="gap:6px"><span class="badge ${side==='Yes'?'b-terrace':'b-lost'}">${side} · ${odds}</span><span class="badge b-settled">£${stake} stake</span></div></div>
    <div style="text-align:right"><div class="badge ${state==='Won'?'b-won':state==='Lost'?'b-lost':'b-flash'}">${state}</div><div style="font-family:var(--cond);font-size:20px;font-weight:700;margin-top:6px;color:${state==='Lost'?'var(--ink-3)':'var(--green)'}">${ret}</div></div>
  </div>
</div>`;

SCREENS.profile = () => `
${header({title:'mikeyd', sub:'Casual tier · 6 calls', bal:null, actions:['share']})}
<div class="scroll" style="padding:0 var(--gutter)">
  <div class="card" style="margin-top:14px">
    <div class="row">
      <div class="avatar" style="width:58px;height:58px;font-size:22px;background:#1d4ed8">MD</div>
      <div style="flex:1">
        <div class="row" style="gap:7px"><span style="font-family:var(--cond);font-size:23px;font-weight:700">@mikeyd</span><span class="badge b-flash">${ic('flame','i-14')} 3</span></div>
        <div class="umeta">Following 34 · 12 followers</div>
      </div>
      <div style="text-align:right"><div style="font-family:var(--cond);font-size:38px;font-weight:700;line-height:.9">83<span style="font-size:18px;color:var(--green)">%</span></div><div class="umeta">win rate</div></div>
    </div>
  </div>
  <div class="stats" style="margin-top:10px">
    <div class="stat"><div class="v" style="color:var(--green)">5</div><div class="k">Won</div></div>
    <div class="stat"><div class="v" style="color:var(--red-ink)">1</div><div class="k">Lost</div></div>
    <div class="stat"><div class="v">+£10</div><div class="k">Profit</div></div>
  </div>
  <div class="card" style="margin-top:10px">
    <div class="row">
      <div style="flex:1"><div class="eyebrow">Available balance</div><div style="font-family:var(--cond);font-size:34px;font-weight:700;line-height:1.1">£14.22</div></div>
      <button class="btn-out">${ic('plus','i-14')} Add funds</button>
    </div>
    <button class="kv" style="width:100%;border-top:1px solid var(--line-hair);margin-top:12px;padding-bottom:0" data-sheet="wallet">
      <span class="k row" style="gap:8px">${ic('wallet','i-16')} Wallet &amp; payouts</span><span class="v" style="color:var(--ink-3)">${ic('chevronRight','i-16')}</span>
    </button>
  </div>
  <div class="sec" style="padding:16px 0 6px">
    <div class="sec-hd"><h3>Play</h3></div>
    <div class="stats">
      <button class="stat" data-goto="matchups" style="text-align:left">${ic('swords','i-22')}<div class="k" style="margin-top:8px;color:var(--ink);font-weight:700">1v1<br>matchups</div></button>
      <button class="stat" data-goto="parlay" style="text-align:left">${ic('list','i-22')}<div class="k" style="margin-top:8px;color:var(--ink);font-weight:700">Build a<br>parlay</div></button>
      <button class="stat" data-goto="leagues" style="text-align:left">${ic('trophy','i-22')}<div class="k" style="margin-top:8px;color:var(--ink);font-weight:700">Private<br>leagues</div></button>
    </div>
  </div>
  <div style="padding:14px 0 10px"><div class="seg sub"><button class="on">Open</button><button>Settled</button><button>Created</button><button data-goto="leagues">Leagues</button></div></div>
  ${betRow('Man City to win the title','Yes','11/4','1.00','£3.75','Open')}
  ${betRow('Liverpool to win the Champions League','No','4/5','1.00','£1.80','Open')}
  ${betRow('Bruno to be Player of the Season','No','1/2','2.00','£3.00','Won')}
  <div style="height:20px"></div>
</div>
${tabbar('profile')}`;

SCREENS.__sheet_wallet = () => `
<div class="sheetwrap"><div class="scrim" data-sheet=""></div>
<div class="sheet">
  <div class="grabber"></div>
  <div class="row"><div style="flex:1;font-family:var(--cond);font-size:24px;font-weight:700;text-transform:uppercase">Wallet &amp; payouts</div><button class="iconbtn" data-sheet="">${ic('close')}</button></div>
  <div class="card" style="margin-top:14px">
    <div class="kv" style="padding-top:0"><span class="k">Available</span><span class="v" style="font-family:var(--cond);font-size:22px">£14.22</span></div>
    <div class="kv" style="border-top:1px solid var(--line-hair)"><span class="k">In open bets</span><span class="v">£2.00</span></div>
    <div class="kv" style="border-top:1px solid var(--line-hair);padding-bottom:0"><span class="k">Creator fees earned</span><span class="v" style="color:var(--amber-ink)">£0.08</span></div>
  </div>
  <div class="row" style="gap:8px;margin-top:12px"><button class="cta cta-sm">Add funds</button><button class="cta cta-ghost cta-sm">Withdraw</button></div>
  <div class="flabel" style="margin-top:20px">Advanced</div>
  <div class="card" style="padding:4px 14px">
    <div class="kv" style="border-bottom:1px solid var(--line-hair)"><span class="k">Wallet address</span><span class="v row" style="gap:6px;color:var(--ink-2);font-size:12.5px">6Gr3R1…YvKZuq ${ic('copy','i-14')}</span></div>
    <div class="kv"><div><div class="v">Show network details</div><div class="umeta">Solana mainnet · USDC balances</div></div><div class="switch"><i></i></div></div>
  </div>
  <div class="row" style="justify-content:center;gap:6px;margin-top:14px"><span class="badge b-terrace">Non-custodial</span><span class="badge b-private">${ic('lock','i-14')} Arcium private bets</span></div>
</div></div>`;

/* ── LEAGUES ──────────────────────────────────────────────────────────── */
const leagueCard = (name, gw, members, pts, wins, priv) => `
<div class="card card-tap">
  <div class="row"><div style="flex:1"><div style="font-family:var(--cond);font-size:20px;font-weight:700;text-transform:uppercase;letter-spacing:.3px">${name}</div><div class="umeta">GW ${gw} · ${members} members</div></div>
  ${priv?`<span class="badge b-private">${ic('lock','i-14')} Private</span>`:`<span class="badge b-open">Open</span>`}</div>
  <div class="stats" style="margin-top:12px">
    <div class="stat" style="background:var(--deep)"><div class="v" style="color:var(--green)">${pts}</div><div class="k">GW points</div></div>
    <div class="stat" style="background:var(--deep)"><div class="v">${wins}</div><div class="k">Total wins</div></div>
    <div class="stat" style="background:var(--deep)"><div class="v" style="color:var(--blue)">S1</div><div class="k">Season</div></div>
  </div>
</div>`;

SCREENS.leagues = () => `
${leaguesChrome('mine')}
<div class="scroll" style="padding:4px var(--gutter) 0">
  <div class="card" style="border-color:#1f3a2a;background:linear-gradient(180deg,#0d1a12,#0f0f0f)">
    <div class="row"><div style="flex:1"><div class="eyebrow" style="color:var(--green-ink)">Your rank</div><div style="font-family:var(--cond);font-size:32px;font-weight:700;line-height:1.05">2nd <span style="font-size:16px;color:var(--ink-3)">of 20</span></div><div class="umeta">Arcium League · 4 points off top</div></div>${ic('crown','i-26')}</div>
  </div>
  <div class="sec" style="padding:16px 0 0"><div class="sec-hd"><h3>Your leagues</h3><span class="more" data-goto="league-create">New ${ic('plus','i-14')}</span></div></div>
  <div data-goto="league-detail">${leagueCard('Arcium League',12,'2/20',4,4,true)}</div>
  ${leagueCard('The World Eleven',12,'1/20',0,0,true)}
  ${leagueCard('Deep Eleven',12,'1/20',0,0,false)}
  <div style="height:20px"></div>
</div>
${tabbar('profile')}`;

/* ── ONBOARDING ───────────────────────────────────────────────────────── */
SCREENS.onboarding = () => `
<div class="screen" style="padding:0 22px 26px">
  <div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:26px">
    <div class="logo" style="gap:12px"><div class="logo-mark" style="width:44px;height:44px;border-radius:13px"><i style="width:14px;height:14px"></i></div><div class="logo-word" style="font-size:30px">Terrace</div></div>
    <div>
      <div style="font-family:var(--cond);font-size:46px;font-weight:800;line-height:.98;text-transform:uppercase;letter-spacing:-.5px">Back your<br>take.</div>
      <div style="color:var(--ink-2);font-size:15px;margin-top:12px;max-width:280px;text-wrap:pretty">Football calls with your mates. Real odds, instant payouts, no bookmaker.</div>
    </div>
    <div class="rowlist">
      ${[['pitch','Every match, every market','Premier League, UCL, La Liga'],['cards','Swipe your matchday calls','Back or fade in one thumb'],['users','Copy the sharpest fans','Follow, copy, brag']].map(([i,t,s])=>`
      <div class="listrow"><div class="avatar" style="background:var(--green-deep);color:var(--green)">${ic(i,'i-22')}</div><div><div class="uname">${t}</div><div class="umeta">${s}</div></div></div>`).join('')}
    </div>
  </div>
  <button class="cta" data-goto="home">Get started</button>
  <button class="cta cta-ghost cta-sm" style="margin-top:8px" data-goto="home">I already have an account</button>
  <div class="umeta" style="text-align:center;margin-top:14px">18+ · Please gamble responsibly</div>
</div>`;

/* ── LOADERS ──────────────────────────────────────────────────────────── */
SCREENS.__skeleton = (tab) => `
${header({title:'\u2007', sub:'\u2007', bal:null, actions:[]})}
<div class="scroll" style="padding:16px var(--gutter)">
  <div class="sk" style="height:16px;width:120px;margin-bottom:14px"></div>
  ${[0,1,2].map(()=>`<div class="card" style="border-color:var(--line-hair)">
    <div class="row" style="margin-bottom:12px"><div class="sk" style="width:34px;height:34px;border-radius:9px"></div><div class="sk" style="height:12px;flex:1"></div></div>
    <div class="oddsrow"><div class="sk" style="height:52px"></div><div class="sk" style="height:52px"></div><div class="sk" style="height:52px"></div></div>
  </div>`).join('')}
</div>
${tabbar(tab||'home')}`;

SCREENS.__splash = () => `
<div class="splash">
  <div class="logo" style="flex-direction:column;gap:14px"><div class="logo-mark" style="width:56px;height:56px;border-radius:17px"><i style="width:18px;height:18px"></i></div><div class="logo-word" style="font-size:26px">Terrace</div></div>
  <div class="bar"><i></i></div>
</div>`;

/* ── mount helper for design-system cards ─────────────────────────────── */
window.mountScreen = function(name, el, opts){
  opts = opts || {};
  el.innerHTML = statusbar() + '<div class="screen">' + SCREENS[name]() + '</div>' +
    (opts.sheet ? SCREENS['__sheet_' + opts.sheet]() : '');
};
