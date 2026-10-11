/* Terrace — screens part 3: flash markets, 1v1 matchups, parlays, league detail/create/join */

/* ── FLASH MARKETS · tied to a live match ────────────────────────────── */
const flashRow = (q, sub, o, left) => `
<div class="card card-tap">
  <div class="row" style="align-items:flex-start">
    <div style="flex:1">
      <div style="font-size:14.5px;font-weight:600">${q}</div>
      <div class="umeta">${sub}</div>
    </div>
    <span class="badge b-flash">${ic('clock','i-14')} ${left}</span>
  </div>
  <div class="oddsrow two" style="margin-top:10px">${odd('Back · yes',o[0],'odd-yes')}${odd('Fade · no',o[1],'odd-no')}</div>
</div>`;

SCREENS.flash = () => `
${header({title:'Flash markets', sub:'In-play only · settle before the whistle', back:'home', actions:[]})}
<div class="chiprow" style="padding-top:12px">
  <button class="chip on">${ic('flame','i-14')} All live</button>
  <button class="chip">Arsenal v Chelsea</button>
  <button class="chip">Man Utd v Spurs</button>
  <button class="chip">Real v Barça</button>
</div>
<div class="scroll" style="padding:10px var(--gutter) 0">
  <div class="card" style="border-color:#3a1f1f;background:linear-gradient(180deg,#180f0f,#0f0f0f)">
    <div class="row"><span class="badge b-live"><i class="livedot"></i>LIVE</span><span class="badge b-min">38'</span><span class="match-lg" style="margin-left:auto">Half time in 7'</span></div>
    <div class="row" style="margin-top:11px;gap:10px">
      ${crest('MUN')}<span style="font-size:14.5px;font-weight:600">Man Utd</span>
      <span style="font-family:var(--cond);font-size:22px;font-weight:700">1 – 1</span>
      <span style="font-size:14.5px;font-weight:600;flex:1;text-align:right">Tottenham</span>${crest('TOT')}
    </div>
  </div>
  <div class="sec" style="padding:16px 0 0"><div class="sec-hd"><h3 style="color:var(--amber-ink)">Before half time</h3><span class="badge b-flash">Closes 7'</span></div></div>
  ${flashRow('Cunha to score before half time','Man Utd v Tottenham · Player goal',['9/2','1/6'],'6m 40s')}
  ${flashRow('Another goal before the break','Man Utd v Tottenham · Goals',['5/2','1/3'],'6m 40s')}
  ${flashRow('Booking in the next 10 minutes','Man Utd v Tottenham · Cards',['6/4','1/2'],'6m 40s')}
  <div class="sec" style="padding:16px 0 0"><div class="sec-hd"><h3>Later in the match</h3></div></div>
  ${flashRow('Man Utd to score in extra time','Man Utd v Tottenham · Goals',['11/4','2/7'],'Full time')}
  ${flashRow('Bruno to assist in the second half','Man Utd v Tottenham · Player assist',['7/2','1/5'],'Full time')}
  <div style="height:18px"></div>
</div>
${tabbar('markets')}`;

/* ── 1v1 MATCHUPS ─────────────────────────────────────────────────────── */
const matchupsChrome = (mode) => `
${header({title:'1v1 Matchups', sub:'Head to head with a mate', back:'profile', actions:[]})}
<div style="padding:12px var(--gutter) 10px">
  <div class="seg">
    <button class="${mode==='new'?'on':''}" data-goto="matchups">${ic('swords','i-16')} New</button>
    <button class="${mode==='active'?'on':''}" data-goto="matchups-active">Active <span style="opacity:.6">8</span></button>
    <button class="${mode==='inbox'?'on':''}" data-goto="matchups-inbox">Inbox <span style="opacity:.6">3</span></button>
  </div>
</div>`;

SCREENS.matchups = () => `
${matchupsChrome('new')}
<div class="scroll" style="padding:4px var(--gutter) 0">
  <div class="flabel">The call</div>
  <button class="field row" style="width:100%;text-align:left">
    <div style="display:flex">${crest('ARS')}<div style="margin-left:-9px">${crest('CHE')}</div></div>
    <div style="flex:1"><div style="font-size:14px;font-weight:600">Arsenal to win</div><div class="umeta">Premier League · today 16:30</div></div>
    ${ic('chevronRight','i-16')}
  </button>

  <div class="flabel" style="margin-top:18px">Your side</div>
  <div class="oddsrow two">${odd('Back · yes','8/13','odd-yes on')}${odd('Fade · no','5/4','odd-no')}</div>
  <div class="umeta" style="margin-top:6px">Your mate automatically takes the other side.</div>

  <div class="flabel" style="margin-top:18px">Opponent</div>
  <button class="field row" style="width:100%;text-align:left" data-sheet="opponent">
    <div class="avatar" style="background:#7c2d12">SK</div>
    <div style="flex:1"><div style="font-size:14px;font-weight:600">saoirse.k</div><div class="umeta">71% win rate · 6 win streak</div></div>
    ${ic('chevronDown','i-16')}
  </button>

  <div class="flabel" style="margin-top:18px">Stake — equal on both sides</div>
  <div class="oddsrow" style="grid-template-columns:repeat(4,1fr)">
    <button class="odd" style="min-height:42px"><span class="val" style="font-size:16px">£1</span></button>
    <button class="odd on" style="min-height:42px"><span class="val" style="font-size:16px">£5</span></button>
    <button class="odd" style="min-height:42px"><span class="val" style="font-size:16px">£10</span></button>
    <button class="odd" style="min-height:42px"><span class="val" style="font-size:16px">£25</span></button>
  </div>
  <div class="card" style="margin-top:10px">
    <div class="kv" style="padding-top:0"><span class="k">You stake</span><span class="v">£5.00</span></div>
    <div class="kv" style="border-top:1px solid var(--line-hair)"><span class="k">saoirse.k stakes</span><span class="v">£5.00</span></div>
    <div class="kv" style="border-top:1px solid var(--line-hair);padding-bottom:0"><span class="k">Winner takes</span><span class="v" style="font-family:var(--cond);font-size:22px;color:var(--green)">£10.00</span></div>
  </div>
  <button class="cta" style="margin-top:14px" data-sheet="challenged">${ic('swords','i-16')} Send challenge</button>
  <div class="umeta" style="text-align:center;margin-top:10px">Expires if it isn't accepted before kick-off.</div>
  <div style="height:18px"></div>
</div>
${tabbar('profile')}`;

const matchupCard = (dir, who, initials, colour, q, side, stake, state) => `
<div class="card card-tap">
  <div class="row">
    <div class="avatar" style="background:${colour}">${initials}</div>
    <div style="flex:1"><div class="umeta">${dir}</div><div class="uname">${who}</div></div>
    <span class="badge ${state==='Active'?'b-open':state==='Waiting'?'b-flash':state==='Won'?'b-won':'b-settled'}">${state}</span>
  </div>
  <div style="font-size:14.5px;font-weight:600;margin:11px 0 9px">${q}</div>
  <div class="row" style="gap:7px">
    <span class="badge ${side==='Yes'?'b-terrace':'b-lost'}">You: ${side}</span>
    <span class="badge b-settled">£${stake} each</span>
    <span style="margin-left:auto;font-family:var(--cond);font-size:19px;font-weight:700;color:var(--green)">£${(stake*2).toFixed(2)}</span>
  </div>
</div>`;

SCREENS['matchups-active'] = () => `
${matchupsChrome('active')}
<div class="scroll" style="padding:4px var(--gutter) 0">
  ${matchupCard('You challenged','saoirse.k','SK','#7c2d12','Liverpool to win the Champions League','No',5,'Active')}
  ${matchupCard('You challenged','jamie.b','JB','#166534','Man City to win the title','No',5,'Active')}
  ${matchupCard('You challenged','rednev','RN','#831843','Arsenal to win the Premier League','Yes',1,'Waiting')}
  ${matchupCard('Accepted','arsenal_tom','AT','#4c1d95','Both teams to score at the Emirates','Yes',5,'Won')}
  <div style="height:18px"></div>
</div>
${tabbar('profile')}`;

SCREENS['matchups-inbox'] = () => `
${matchupsChrome('inbox')}
<div class="scroll" style="padding:4px var(--gutter) 0">
  <div class="card" style="border-color:#1f3a2a">
    <div class="row">
      <div class="avatar" style="background:#7c2d12">SK</div>
      <div style="flex:1"><div class="umeta">Challenge from</div><div class="uname">saoirse.k</div></div>
      <span class="badge b-flash">${ic('hourglass','i-14')} 2h left</span>
    </div>
    <div style="font-size:14.5px;font-weight:600;margin:11px 0 9px">Man City to win the title</div>
    <div class="row" style="gap:7px;margin-bottom:12px"><span class="badge b-lost">She has: No</span><span class="badge b-terrace">You'd take: Yes</span><span class="badge b-settled">£5 each</span></div>
    <div class="row" style="gap:8px"><button class="cta cta-sm">Accept · £5</button><button class="cta cta-ghost cta-sm">Decline</button></div>
  </div>
  ${matchupCard('Challenge from','jamie.b','JB','#166534','Arsenal to finish above Tottenham','Yes',1,'Active').replace('</div>\n</div>','</div><button class="cta cta-ghost cta-sm" style="margin-top:12px">Settle matchup</button></div>')}
  ${matchupCard('Challenge from','rednev','RN','#831843','Man City to finish in the top four','No',1,'Lost')}
  <div style="height:18px"></div>
</div>
${tabbar('profile')}`;

SCREENS.__sheet_opponent = () => `
<div class="sheetwrap"><div class="scrim" data-sheet=""></div>
<div class="sheet">
  <div class="grabber"></div>
  <div class="row"><div style="flex:1;font-family:var(--cond);font-size:24px;font-weight:700;text-transform:uppercase">Pick your opponent</div><button class="iconbtn" data-sheet="">${ic('close')}</button></div>
  <div class="field row" style="margin-top:14px">${ic('search','i-16')}<input placeholder="Search a username" /></div>
  <div class="flabel" style="margin-top:16px">People you follow</div>
  <div class="card" style="padding:4px 14px">
    ${fanRow('SK','#7c2d12','saoirse.k','71% win rate · 6 win streak','follow').replace('Follow','Choose')}
    ${fanRow('JB','#166534','jamie.b','78% win rate · 46 bets','follow').replace('Follow','Choose')}
    ${fanRow('AT','#4c1d95','arsenal_tom','71% win rate · 132 bets','follow').replace('Follow','Choose')}
  </div>
  <button class="cta cta-ghost cta-sm" style="margin-top:12px">Invite by link instead</button>
</div></div>`;

SCREENS.__sheet_challenged = () => `
<div class="sheetwrap"><div class="scrim" data-sheet=""></div>
<div class="sheet" style="text-align:center">
  <div class="grabber"></div>
  <div style="width:58px;height:58px;border-radius:50%;background:var(--green-deep);border:1.5px solid var(--green);color:var(--green);display:flex;align-items:center;justify-content:center;margin:6px auto 14px">${ic('swords','i-26')}</div>
  <div style="font-family:var(--cond);font-size:26px;font-weight:700;text-transform:uppercase">Challenge sent</div>
  <div class="umeta" style="font-size:13px;margin-top:4px">saoirse.k has until kick-off to accept. £10 winner takes all.</div>
  <div class="row" style="gap:8px;margin-top:16px"><button class="cta cta-ghost cta-sm" data-sheet="">Close</button><button class="cta cta-sm" data-goto="matchups-active" data-sheet="">View matchups</button></div>
</div></div>`;

/* ── PARLAYS ──────────────────────────────────────────────────────────── */
const legRow = (q, sub, odds, on) => `
<button class="card card-tap" style="width:100%;text-align:left;border-color:${on?'var(--green)':'var(--line-soft)'};background:${on?'#0c1710':'var(--surface)'}">
  <div class="row">
    <div style="width:22px;height:22px;border-radius:6px;border:1.5px solid ${on?'var(--green)':'var(--line)'};background:${on?'var(--green)':'transparent'};color:#04180c;display:flex;align-items:center;justify-content:center;flex:none">${on?ic('check','i-14'):''}</div>
    <div style="flex:1"><div style="font-size:14px;font-weight:600">${q}</div><div class="umeta">${sub}</div></div>
    <span style="font-family:var(--cond);font-size:19px;font-weight:700;color:${on?'var(--green)':'var(--ink)'}">${odds}</span>
  </div>
</button>`;

SCREENS.parlay = () => `
${header({title:'Build a parlay', sub:'2–8 legs · all must land', back:'profile', actions:[]})}
<div class="chiprow" style="padding-top:12px">
  <button class="chip on">All football</button>
  <button class="chip">${ic('flame','i-14')} Live</button>
  <button class="chip">Premier League</button>
  <button class="chip">Champions League</button>
</div>
<div class="scroll" style="padding:10px var(--gutter) 88px">
  <div class="eyebrow" style="margin-bottom:9px">Open markets · 24</div>
  ${legRow('Arsenal to win','Arsenal v Chelsea · Match result','8/13',true)}
  <div style="height:10px"></div>
  ${legRow('Both teams to score','Liverpool v Man City · Goals','4/6',true)}
  <div style="height:10px"></div>
  ${legRow('Real Madrid to win','Real v Barça · Match result','6/5',true)}
  <div style="height:10px"></div>
  ${legRow('Over 2.5 goals','PSG v Inter · Goals','8/11',false)}
  <div style="height:10px"></div>
  ${legRow('Bruno to score or assist','Man Utd v Spurs · Player','5/4',false)}
</div>
<button class="slipbar" data-sheet="parlay"><span class="n">3</span><b>3-leg parlay</b><span class="rt">9/2 ${ic('chevronRight','i-16')}</span></button>
${tabbar('profile')}`;

SCREENS.__sheet_parlay = () => `
<div class="sheetwrap"><div class="scrim" data-sheet=""></div>
<div class="sheet">
  <div class="grabber"></div>
  <div class="row"><div style="flex:1"><div class="eyebrow">3 legs · all must land</div><div style="font-family:var(--cond);font-size:27px;font-weight:700;text-transform:uppercase">Parlay <span style="color:var(--green)">9/2</span></div></div><button class="iconbtn" data-sheet="">${ic('close')}</button></div>
  <div class="card" style="margin-top:14px;padding:4px 14px">
    ${[['Arsenal to win','8/13'],['Both teams to score','4/6'],['Real Madrid to win','6/5']].map(([q,o])=>`
    <div class="kv" style="border-bottom:1px solid var(--line-hair)"><span class="k" style="color:var(--ink)">${q}</span><span class="v" style="font-family:var(--cond);font-size:18px">${o}</span></div>`).join('')}
    <div class="kv"><span class="k">Combined odds</span><span class="v" style="font-family:var(--cond);font-size:20px;color:var(--green)">9/2</span></div>
  </div>
  <div class="flabel" style="margin-top:16px">Stake</div>
  <div class="field row"><span style="color:var(--ink-3);font-size:19px;font-weight:600">£</span><input value="10" inputmode="decimal" /></div>
  <div class="kv" style="border-top:1px solid var(--line-hair);margin-top:12px"><span class="k">Potential returns</span><span class="v" style="font-family:var(--cond);font-size:22px;color:var(--green)">£55.00</span></div>
  <button class="cta" data-sheet="placed">Place parlay · £10</button>
  <div class="umeta" style="text-align:center;margin-top:11px">One leg lost and the parlay is gone. No cash out on parlays yet.</div>
</div></div>`;

/* ── LEAGUES: create / join / detail ─────────────────────────────────── */
const leaguesChrome = (mode) => `
${header({title:'Leagues', sub:'Season 1 · gameweek 12', back:'profile', actions:[]})}
<div style="padding:12px var(--gutter) 10px">
  <div class="seg">
    <button class="${mode==='mine'?'on':''}" data-goto="leagues">Mine</button>
    <button class="${mode==='create'?'on':''}" data-goto="league-create">Create</button>
    <button class="${mode==='join'?'on':''}" data-goto="league-join">Join</button>
  </div>
</div>`;

SCREENS['league-create'] = () => `
${leaguesChrome('create')}
<div class="scroll" style="padding:4px var(--gutter) 0">
  <div class="flabel">League name</div>
  <div class="field"><input placeholder="e.g. The Sharp Eleven" /></div>
  <div class="flabel" style="margin-top:18px">Size</div>
  <div class="seg sub"><button>10</button><button class="on">20</button><button>50</button><button>100</button></div>
  <div class="flabel" style="margin-top:18px">Entry fee</div>
  <div class="oddsrow" style="grid-template-columns:repeat(4,1fr)">
    <button class="odd on" style="min-height:42px"><span class="val" style="font-size:16px">Free</span></button>
    <button class="odd" style="min-height:42px"><span class="val" style="font-size:16px">£1</span></button>
    <button class="odd" style="min-height:42px"><span class="val" style="font-size:16px">£2</span></button>
    <button class="odd" style="min-height:42px"><span class="val" style="font-size:16px">£5</span></button>
  </div>
  <div class="umeta" style="margin-top:6px">Every entry goes to the prize pool. Winner takes the pool at the end of the season.</div>
  <div class="flabel" style="margin-top:18px">Privacy</div>
  <div class="card" style="padding:4px 14px">
    <div class="kv"><div><div class="v">Hide standings until reveal <span class="badge b-private" style="margin-left:4px">${ic('lock','i-14')} Arcium</span></div><div class="umeta">Nobody sees points until the gameweek closes</div></div><div class="switch on"><i></i></div></div>
  </div>
  <button class="cta" style="margin-top:16px" data-goto="league-detail">Create league</button>
  <div style="height:18px"></div>
</div>
${tabbar('profile')}`;

SCREENS['league-join'] = () => `
${leaguesChrome('join')}
<div class="scroll" style="padding:4px var(--gutter) 0">
  <div class="flabel">Invite code or link</div>
  <div class="field row">${ic('users','i-16')}<input placeholder="Paste an invite" /></div>
  <button class="cta" style="margin-top:12px" data-goto="league-detail">Join league</button>
  <div class="sec" style="padding:22px 0 0"><div class="sec-hd"><h3>Open to join</h3></div></div>
  ${[['The Terrace Ten','18/20 members','Free'],['Sunday Pundits','7/10 members','£1 entry'],['Matchday Sharps','34/50 members','£2 entry']].map(([n,m,f])=>`
  <div class="card card-tap" data-goto="league-detail">
    <div class="row"><div style="flex:1"><div style="font-family:var(--cond);font-size:19px;font-weight:700;text-transform:uppercase">${n}</div><div class="umeta">${m} · ${f}</div></div><button class="btn-out">Join</button></div>
  </div>`).join('')}
  <div style="height:18px"></div>
</div>
${tabbar('profile')}`;

const standingRow = (pos, initials, colour, name, total, gw, hidden, me) => `
<div class="listrow" style="${me?'background:#0c1710;border-radius:12px;padding:12px 12px;margin:0 -12px':''}">
  <div style="font-family:var(--cond);font-size:17px;font-weight:700;color:${pos===1?'var(--amber-ink)':pos===2?'#cbd5e1':pos===3?'#b98155':'var(--ink-4)'};width:20px;flex:none">${pos}</div>
  <div class="avatar" style="background:${colour};width:32px;height:32px;font-size:13px">${initials}</div>
  <div style="flex:1"><div class="uname" style="color:${me?'var(--green)':'var(--ink)'}">${me?'You':name}</div><div class="umeta">${total} pts this season</div></div>
  ${hidden ? `<span class="badge b-private">${ic('lock','i-14')} Hidden</span>` : `<div style="text-align:right"><div style="font-family:var(--cond);font-size:21px;font-weight:700;color:var(--green)">${gw}</div><div class="umeta" style="font-size:10px">GW pts</div></div>`}
</div>`;

SCREENS['league-detail'] = () => `
${header({title:'Arcium League', sub:'Season 1 · gameweek 12', back:'leagues', actions:['share']})}
<div class="scroll" style="padding:14px var(--gutter) 0">
  <div class="card" style="border-color:#3b2d6b;background:linear-gradient(180deg,#160f28,#0f0f0f)">
    <div class="row">
      <div style="flex:1"><div class="eyebrow" style="color:var(--violet-ink)">Gameweek 11 revealed</div><div style="font-family:var(--cond);font-size:34px;font-weight:700;line-height:1.05;color:var(--green)">4 pts</div><div class="umeta">2nd of 20 · 4 points off the top</div></div>
      <span class="badge b-private">${ic('lock','i-14')} Arcium</span>
    </div>
  </div>
  <div class="stats" style="margin-top:10px">
    <div class="stat"><div class="v">18</div><div class="k">Season pts</div></div>
    <div class="stat"><div class="v" style="color:var(--green)">2nd</div><div class="k">Rank</div></div>
    <div class="stat"><div class="v" style="color:var(--amber-ink)">£40</div><div class="k">Prize pool</div></div>
  </div>
  <div class="row" style="gap:8px;margin-top:10px"><button class="cta cta-ghost cta-sm">${ic('share','i-16')} Share invite</button><button class="cta cta-ghost cta-sm">${ic('copy','i-16')} Copy link</button></div>
  <div class="sec" style="padding:18px 0 0">
    <div class="sec-hd"><h3>Gameweek 12</h3><span class="badge b-private" style="margin-left:auto">${ic('lock','i-14')} Hidden until Sunday</span></div>
  </div>
  <div class="card" style="padding:4px 14px">
    ${standingRow(1,'MD','#1d4ed8','You',18,'—',true,true)}
    ${standingRow(2,'SK','#7c2d12','saoirse.k',14,'—',true)}
    ${standingRow(3,'JB','#166534','jamie.b',11,'—',true)}
  </div>
  <div class="sec" style="padding:18px 0 0"><div class="sec-hd"><h3>Gameweek 11</h3><span class="more">History ${ic('chevronRight','i-14')}</span></div></div>
  <div class="card" style="padding:4px 14px">
    ${standingRow(1,'MD','#1d4ed8','You',18,4,false,true)}
    ${standingRow(2,'SK','#7c2d12','saoirse.k',14,3,false)}
    ${standingRow(3,'JB','#166534','jamie.b',11,1,false)}
  </div>
  <div style="height:20px"></div>
</div>
${tabbar('profile')}`;
