/* Terrace — screen markup library (football only). Registers window.SCREENS. */
window.SCREENS = window.SCREENS || {};

/* ── data ─────────────────────────────────────────────────────────────── */
const CLUB = {
  ARS:['#EF0107','Arsenal'], CHE:['#034694','Chelsea'], LIV:['#C8102E','Liverpool'],
  MCI:['#6CABDD','Man City'], MUN:['#DA291C','Man Utd'], TOT:['#132257','Tottenham'],
  NEW:['#241F20','Newcastle'], AVL:['#670E36','Aston Villa'], RMA:['#1F3B73','Real Madrid'],
  BAR:['#A50044','Barcelona'], BAY:['#DC052D','Bayern'], PSG:['#004170','PSG'],
  INT:['#0068A8','Inter'], JUV:['#1A1A1A','Juventus'], DOR:['#FDE100','Dortmund'],
  ATM:['#CB3524','Atlético']
};
const crest = (c, cls) => {
  const k = CLUB[c] || ['#1f2937', c];
  return `<div class="crest ${cls||''}" style="background:${k[0]}">${c}</div>`;
};
const clubName = c => (CLUB[c] ? CLUB[c][1] : c);

/* ── chrome ───────────────────────────────────────────────────────────── */
const statusbar = () => `<div class="statusbar"><span>9:41</span><div class="sbr">${ic('chart','i-14')}${ic('bell','i-14')}<span style="font-weight:700">100%</span></div></div>`;

const tabbar = (active) => {
  const t = [['home','Home','home'],['markets','Markets','pitch'],['create','Create','plus'],['social','Social','users'],['profile','Profile','shield']];
  return `<nav class="tabbar">${t.map(([id,label,icon]) => `<button class="tab ${id==='create'?'tab-create':''} ${active===id?'on':''}" data-goto="${id}"><span class="pill">${ic(icon,'i-22')}</span><span>${label}</span></button>`).join('')}</nav>`;
};

const header = ({title, sub, back, brand, bal='£14.22', actions=['search','bell']}) => `
<header class="hdr">
  ${back ? `<button class="iconbtn" data-goto="${back}">${ic('chevronLeft')}</button>` : ''}
  ${brand ? `<div class="logo"><div class="logo-mark"><i></i></div><div class="logo-word">Terrace</div></div>` :
    `<div><div class="hdr-title">${title}</div>${sub?`<div class="hdr-sub">${sub}</div>`:''}</div>`}
  <div class="hdr-act">
    ${actions.includes('search')?`<button class="iconbtn">${ic('search')}</button>`:''}
    ${actions.includes('share')?`<button class="iconbtn">${ic('share')}</button>`:''}
    ${actions.includes('bell')?`<button class="iconbtn">${ic('bell')}<span class="dot"></span></button>`:''}
    ${bal?`<button class="balpill">${ic('wallet','i-16')}${bal}</button>`:''}
  </div>
</header>`;

const odd = (lbl, val, cls='') => `<button class="odd ${cls}"><span class="lbl">${lbl}</span><span class="val">${val}</span></button>`;

/* ── HOME · in-play first ─────────────────────────────────────────────── */
const liveCard = (h, a, hs, as, min, mkt, o) => `
<div class="card card-tap" data-goto="detail" style="min-width:262px;flex:none">
  <div class="match-top"><span class="badge b-live"><i class="livedot"></i>LIVE</span><span class="badge b-min">${min}'</span><span class="match-lg" style="margin-left:auto">${mkt}</span></div>
  <div class="match-teams" style="margin:11px 0 12px">
    <div class="team">${crest(h)}<span class="nm">${clubName(h)}</span><span class="sc">${hs}</span></div>
    <div class="team ${as>hs?'':'dim'}">${crest(a)}<span class="nm">${clubName(a)}</span><span class="sc">${as}</span></div>
  </div>
  <div class="oddsrow">${odd('Home',o[0],'up')}${odd('Draw',o[1])}${odd('Away',o[2])}</div>
</div>`;

const fixtureRow = (time, h, a, o, tag) => `
<div class="card card-tap" data-goto="detail">
  <div class="match-top"><span class="badge b-open">${time}</span><span class="match-lg">${tag}</span><span style="margin-left:auto;color:var(--ink-4)">${ic('chevronRight','i-16')}</span></div>
  <div class="match-teams" style="margin:10px 0 11px">
    <div class="team">${crest(h)}<span class="nm">${clubName(h)}</span></div>
    <div class="team">${crest(a)}<span class="nm">${clubName(a)}</span></div>
  </div>
  <div class="oddsrow">${odd('Home',o[0])}${odd('Draw',o[1])}${odd('Away',o[2])}</div>
</div>`;

SCREENS.home = () => `
${header({brand:true})}
<div class="scroll">
  <div class="sec">
    <div class="sec-hd"><h3 style="color:var(--red-ink)">In-play now</h3><span class="badge b-min">4 matches</span><span class="more">All ${ic('chevronRight','i-14')}</span></div>
  </div>
  <div class="chiprow" style="gap:10px">
    ${liveCard('ARS','CHE',1,0,67,'Match result',['4/9','7/2','6/1'])}
    ${liveCard('RMA','BAR',2,2,54,'Next goal',['5/6','—','11/10'])}
    ${liveCard('BAY','DOR',0,1,31,'Match result',['4/5','3/1','7/2'])}
  </div>
  <div class="sec">
    <div class="sec-hd"><h3>Next up · today</h3><span class="more">Fixtures ${ic('chevronRight','i-14')}</span></div>
    ${fixtureRow('19:45','LIV','MCI',['6/4','5/2','8/5'],'Premier League')}
    ${fixtureRow('20:00','PSG','INT',['11/10','12/5','2/1'],'Champions League')}
  </div>
  <div class="sec">
    <div class="sec-hd"><h3 style="color:var(--amber-ink)">Flash · in-play</h3><span class="more" data-goto="flash">All ${ic('chevronRight','i-14')}</span></div>
    <div class="card card-tap" data-goto="flash">
      <div class="row"><span class="badge b-live"><i class="livedot"></i>38'</span><span class="match-lg">Man Utd v Tottenham</span><span class="badge b-flash" style="margin-left:auto">${ic('clock','i-14')} 6m 40s</span></div>
      <div style="font-size:14.5px;font-weight:600;margin:10px 0 9px">Cunha to score before half time</div>
      <div class="oddsrow two">${odd('Back · yes','9/2','odd-yes')}${odd('Fade · no','1/6','odd-no')}</div>
    </div>
  </div>
  <div class="sec">
    <div class="sec-hd"><h3>Your follows backed</h3><span class="more">Feed ${ic('chevronRight','i-14')}</span></div>
    <div class="card">
      <div class="listrow" style="padding-top:2px">
        <div class="avatar" style="background:#1d4ed8">MD</div>
        <div style="flex:1"><div class="uname">mikeyd <span style="color:var(--ink-3);font-weight:500">backed</span> Arsenal to win</div><div class="umeta">4/9 · £20 stake · 8 min ago</div></div>
        <button class="btn-out">Copy</button>
      </div>
      <div class="listrow" style="border-top:1px solid var(--line-hair)">
        <div class="avatar" style="background:#7c2d12">SK</div>
        <div style="flex:1"><div class="uname">saoirse.k <span style="color:var(--ink-3);font-weight:500">faded</span> Barcelona clean sheet</div><div class="umeta">11/4 · £5 stake · 22 min ago</div></div>
        <button class="btn-out">Copy</button>
      </div>
    </div>
  </div>
  <div class="sec">
    <div class="sec-hd"><h3>Your leagues</h3><span class="more" data-goto="leagues">All 3 ${ic('chevronRight','i-14')}</span></div>
    <div class="card card-tap" data-goto="league-detail" style="border-color:#3b2d6b;background:linear-gradient(180deg,#160f28,#0f0f0f)">
      <div class="row">
        <div style="flex:1">
          <div class="eyebrow" style="color:var(--violet-ink)">Arcium League · gameweek 12</div>
          <div class="row" style="gap:8px;margin-top:3px"><span style="font-family:var(--cond);font-size:28px;font-weight:700;line-height:1">2nd</span><span class="umeta">of 20 · 4 points off the top</span></div>
        </div>
        <span class="badge b-private">${ic('lock','i-14')} Hidden</span>
      </div>
      <div class="oddsrow" style="margin-top:12px">
        <div class="odd" style="min-height:44px"><span class="lbl">Season</span><span class="val" style="font-size:17px">18 pts</span></div>
        <div class="odd" style="min-height:44px"><span class="lbl">This GW</span><span class="val" style="font-size:17px;color:var(--violet-ink)">Hidden</span></div>
        <div class="odd" style="min-height:44px"><span class="lbl">Pool</span><span class="val" style="font-size:17px;color:var(--amber-ink)">£40</span></div>
      </div>
    </div>
  </div>
  <div class="sec" style="padding-bottom:18px">
    <div class="stats" style="grid-template-columns:repeat(4,1fr)">
      <button class="stat" data-goto="flash" style="text-align:left">${ic('bolt','i-22')}<div class="k" style="margin-top:8px;color:var(--ink);font-weight:700">Flash<br>markets</div></button>
      <button class="stat" data-goto="matchups" style="text-align:left">${ic('swords','i-22')}<div class="k" style="margin-top:8px;color:var(--ink);font-weight:700">1v1<br>matchups</div></button>
      <button class="stat" data-goto="parlay" style="text-align:left">${ic('list','i-22')}<div class="k" style="margin-top:8px;color:var(--ink);font-weight:700">Build a<br>parlay</div></button>
      <button class="stat" data-goto="leagues" style="text-align:left">${ic('trophy','i-22')}<div class="k" style="margin-top:8px;color:var(--ink);font-weight:700">Private<br>leagues</div></button>
    </div>
  </div>
</div>
${tabbar('home')}`;

/* ── MARKETS · list ───────────────────────────────────────────────────── */
const marketCard = (h, a, comp, q, o, src, exp) => `
<div class="card card-tap" data-goto="detail">
  <div class="match-top">
    <span class="badge ${src==='Terrace'?'b-terrace':'b-poly'}">${src}</span>
    <span class="match-lg">${comp}</span>
    <span class="badge b-settled" style="margin-left:auto">${ic('clock','i-14')} ${exp}</span>
  </div>
  <div class="row" style="margin:11px 0 10px">
    <div style="display:flex">${crest(h)}<div style="margin-left:-9px">${crest(a)}</div></div>
    <div style="flex:1"><div style="font-size:14.5px;font-weight:600">${q}</div><div class="umeta">${clubName(h)} v ${clubName(a)}</div></div>
  </div>
  <div class="oddsrow two">${odd('Yes',o[0],'odd-yes')}${odd('No',o[1],'odd-no')}</div>
</div>`;

const marketsChrome = (mode) => `
${header({title:'Football', sub:'Premier League · UCL · La Liga'})}
<div style="padding:12px var(--gutter) 10px">
  <div class="seg">
    <button class="${mode==='list'?'on':''}" data-goto="markets">${ic('list','i-16')} List</button>
    <button class="${mode==='swipe'?'on':''}" data-goto="markets-swipe">${ic('cards','i-16')} Swipe</button>
  </div>
</div>
<div class="chiprow" style="margin-bottom:4px">
  <button class="chip on">All</button>
  <button class="chip">${ic('flame','i-14')} Live</button>
  <button class="chip">Premier League <span class="ct">42</span></button>
  <button class="chip">Champions League <span class="ct">18</span></button>
  <button class="chip">La Liga <span class="ct">26</span></button>
</div>`;

SCREENS.markets = () => `
${marketsChrome('list')}
<div class="scroll" style="padding:8px var(--gutter) 0">
  ${marketCard('ARS','CHE','Premier League','Arsenal to win',['8/13','5/4'],'Terrace','2h 14m')}
  ${marketCard('LIV','MCI','Premier League','Both teams to score',['4/6','11/10'],'Terrace','1d 3h')}
  ${marketCard('RMA','BAR','La Liga','Over 2.5 goals',['8/11','21/20'],'Polymarket','3d 6h')}
  ${marketCard('PSG','INT','Champions League','PSG to win',['11/10','8/11'],'Polymarket','5d 2h')}
</div>
${tabbar('markets')}`;

/* ── MARKETS · swipe deck ─────────────────────────────────────────────── */
const swipeFace = (h, a, comp, q, o, src, exp) => `
  <div class="stamp y">Back</div><div class="stamp n">Fade</div>
  <div class="match-top"><span class="badge ${src==='Terrace'?'b-terrace':'b-poly'}">${src}</span><span class="badge b-flash" style="margin-left:auto">${ic('clock','i-14')} ${exp}</span></div>
  <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px">
    <div class="row" style="gap:16px">
      <div style="text-align:center">${crest(h,'crest-lg')}<div class="umeta" style="margin-top:7px;color:var(--ink-2)">${clubName(h)}</div></div>
      <div style="font-family:var(--cond);font-size:15px;font-weight:700;color:var(--ink-4)">V</div>
      <div style="text-align:center">${crest(a,'crest-lg')}<div class="umeta" style="margin-top:7px;color:var(--ink-2)">${clubName(a)}</div></div>
    </div>
    <div class="match-lg">${comp} · Match result</div>
  </div>
  <div style="font-family:var(--cond);font-size:26px;font-weight:700;letter-spacing:.3px;text-transform:uppercase;line-height:1.05">${q}</div>
  <div class="row" style="margin-top:12px">
    <div class="oddsrow two" style="flex:1">${odd('Back · yes',o[0],'odd-yes')}${odd('Fade · no',o[1],'odd-no')}</div>
  </div>
  <div class="kv" style="padding:9px 0 0;border-top:1px solid var(--line-hair);margin-top:12px"><span class="k">Matched</span><span class="v">£1,240</span></div>`;

SCREENS['markets-swipe'] = () => `
${marketsChrome('swipe')}
<div class="stage">
  <div class="swipecard under2"></div>
  <div class="swipecard under"></div>
  <div class="swipecard" id="topcard">${swipeFace('ARS','CHE','Premier League','Arsenal to win',['8/13','5/4'],'Terrace','2h 14m')}</div>
</div>
<div class="deckacts">
  <button class="act a-no" data-swipe="no">${ic('close','i-26')}</button>
  <button class="act a-skip" data-swipe="skip">${ic('arrowDown')}</button>
  <button class="act a-info" data-goto="detail">${ic('info')}</button>
  <button class="act a-yes" data-swipe="yes">${ic('check','i-26')}</button>
</div>
<div class="deckmeta">18 calls left · swipe left to fade · right to back</div>
${tabbar('markets')}`;

/* ── MARKET DETAIL ────────────────────────────────────────────────────── */
SCREENS.detail = () => `
${header({title:'Match', back:'markets', bal:null, actions:['share']})}
<div class="scroll">
  <div class="sec" style="padding-top:14px">
    <div class="card" style="border-color:var(--line)">
      <div class="row" style="justify-content:center;gap:20px">
        <div style="text-align:center">${crest('ARS','crest-lg')}<div class="umeta" style="margin-top:8px;color:var(--ink)">Arsenal</div></div>
        <div style="text-align:center"><div class="badge b-live" style="margin-bottom:6px"><i class="livedot"></i>67'</div><div style="font-family:var(--cond);font-size:34px;font-weight:700;line-height:1">1 – 0</div></div>
        <div style="text-align:center">${crest('CHE','crest-lg')}<div class="umeta" style="margin-top:8px;color:var(--ink)">Chelsea</div></div>
      </div>
      <div class="match-lg" style="text-align:center;margin-top:12px">Premier League · Emirates Stadium</div>
    </div>
  </div>
  <div style="padding:14px var(--gutter) 0"><div class="seg sub"><button class="on">Match result</button><button>Goals</button><button>Flash</button></div></div>
  <div class="sec">
    <div class="sec-hd"><h3>Full time result</h3><span class="badge b-terrace" style="margin-left:auto">Terrace</span></div>
    <div class="oddsrow">${odd('Arsenal','4/9','up')}${odd('Draw','7/2')}${odd('Chelsea','6/1')}</div>
  </div>
  <div class="sec">
    <div class="sec-hd"><h3>Next goal</h3><span class="badge b-flash" style="margin-left:auto">${ic('bolt','i-14')} Flash · 12m</span></div>
    <div class="oddsrow">${odd('Arsenal','5/6','up')}${odd('No goal','9/4')}${odd('Chelsea','2/1')}</div>
  </div>
  <div class="sec">
    <div class="sec-hd"><h3>Both teams to score</h3></div>
    <div class="oddsrow two">${odd('Yes','4/6','odd-yes on')}${odd('No','11/10','odd-no')}</div>
  </div>
  <div class="sec" style="padding-bottom:80px">
    <div class="sec-hd"><h3>Form</h3></div>
    <div class="card">
      <div class="kv" style="padding-top:0"><span class="k">Arsenal · last 5</span><span class="v" style="letter-spacing:3px;color:var(--green-ink)">WWDWL</span></div>
      <div class="kv" style="border-top:1px solid var(--line-hair)"><span class="k">Chelsea · last 5</span><span class="v" style="letter-spacing:3px;color:var(--red-ink)">LDLWL</span></div>
      <div class="kv" style="border-top:1px solid var(--line-hair);padding-bottom:0"><span class="k">Head to head</span><span class="v">Arsenal 3 · Draw 1 · Chelsea 1</span></div>
    </div>
  </div>
</div>
<button class="slipbar" data-sheet="bet"><span class="n">1</span><b>Both teams to score · Yes</b><span class="rt">4/6 ${ic('chevronRight','i-16')}</span></button>
${tabbar('markets')}`;

/* ── BET SHEET (overlay) ──────────────────────────────────────────────── */
SCREENS.__sheet_bet = (sel) => `
<div class="sheetwrap"><div class="scrim" data-sheet=""></div>
<div class="sheet">
  <div class="grabber"></div>
  <div class="row" style="align-items:flex-start">
    <div style="flex:1">
      <div class="eyebrow" style="margin-bottom:4px">${(sel&&sel.market)||'Arsenal v Chelsea · Both teams to score'}</div>
      <div style="font-family:var(--cond);font-size:27px;font-weight:700;text-transform:uppercase;letter-spacing:.4px">${(sel&&sel.side)||'Yes'} <span style="color:${sel&&sel.side==='No'?'var(--red)':'var(--green)'}">${(sel&&sel.odds)||'4/6'}</span></div>
    </div>
    <button class="iconbtn" data-sheet="">${ic('close')}</button>
  </div>
  <div class="flabel" style="margin-top:18px">Stake</div>
  <div class="field" style="display:flex;align-items:center;gap:8px">
    <span style="color:var(--ink-3);font-size:19px;font-weight:600">£</span>
    <input value="20" inputmode="decimal" />
    <span class="badge b-settled">Max £250</span>
  </div>
  <div class="oddsrow" style="grid-template-columns:repeat(4,1fr);margin-top:8px">
    <button class="odd" style="min-height:42px"><span class="val" style="font-size:16px">£5</span></button>
    <button class="odd" style="min-height:42px"><span class="val" style="font-size:16px">£10</span></button>
    <button class="odd on" style="min-height:42px"><span class="val" style="font-size:16px">£20</span></button>
    <button class="odd" style="min-height:42px"><span class="val" style="font-size:16px">£50</span></button>
  </div>
  <div class="kv" style="border-top:1px solid var(--line-hair);margin-top:14px"><span class="k">Potential returns</span><span class="v" style="font-family:var(--cond);font-size:22px;color:var(--green)">${(sel&&sel.returns)||'£33.33'}</span></div>
  <button class="cta" style="margin-top:6px" data-sheet="placed">Place bet · £20</button>
  <div class="row" style="justify-content:center;gap:6px;margin-top:12px">
    <span class="badge b-poly">Polymarket liquidity</span><span class="badge b-terrace">Settled on Solana</span>
  </div>
</div></div>`;

SCREENS.__sheet_placed = (sel) => `
<div class="sheetwrap"><div class="scrim" data-sheet=""></div>
<div class="sheet" style="text-align:center;padding-bottom:26px">
  <div class="grabber"></div>
  <div style="width:58px;height:58px;border-radius:50%;background:var(--green-deep);border:1.5px solid var(--green);color:var(--green);display:flex;align-items:center;justify-content:center;margin:6px auto 14px">${ic('check','i-26')}</div>
  <div style="font-family:var(--cond);font-size:26px;font-weight:700;text-transform:uppercase;letter-spacing:.4px">Bet placed</div>
  <div class="umeta" style="font-size:13px;margin-top:4px">£20 on ${(sel&&sel.market)||'Both teams to score'} · ${(sel&&sel.side)||'Yes'} at ${(sel&&sel.odds)||'4/6'}</div>
  <div class="card" style="text-align:left;margin-top:16px"><div class="kv" style="padding:0"><span class="k">Returns if it lands</span><span class="v" style="color:var(--green);font-family:var(--cond);font-size:20px">${(sel&&sel.returns)||'£33.33'}</span></div></div>
  <div class="row" style="gap:8px;margin-top:14px">
    <button class="cta cta-ghost cta-sm" data-sheet="">Keep swiping</button>
    <button class="cta cta-sm" data-goto="profile" data-sheet="">My bets</button>
  </div>
</div></div>`;
