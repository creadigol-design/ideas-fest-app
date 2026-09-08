/* Ideas Fest 2026 companion for vedrí. Static PWA, no build step. */
(() => {
  'use strict';

  // ---------- State ----------
  const S = {
    event: null, sessions: [], plan: { favourites: [], curation: {}, profile: {} },
    settings: load('settings', { lead: 10, notify: false }),
    local: load('local', { added: [], removed: [], imported: [], fitOverride: {}, fired: {} }),
    tab: 'now', day: null, filters: { q: '', stage: 'all', fit: 'all' }, swReg: null,
  };
  const TZ = 'Europe/London';
  const $ = (sel, el = document) => el.querySelector(sel);
  const view = $('#view');

  function load(k, d) { try { const v = localStorage.getItem('ifv.' + k); return v ? Object.assign({}, d, JSON.parse(v)) : d; } catch { return d; } }
  function save(k, v) { try { localStorage.setItem('ifv.' + k, JSON.stringify(v)); } catch { /* private mode */ } }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Time (Europe/London, override with ?now=2026-09-09T10:00 for testing) ----------
  const nowOverride = new URLSearchParams(location.search).get('now');
  const overrideBase = nowOverride ? toDate(nowOverride.slice(0, 10), nowOverride.slice(11, 16) || '00:00') : null;
  const bootMs = Date.now();
  function now() { return overrideBase ? new Date(overrideBase.getTime() + (Date.now() - bootMs)) : new Date(); }
  function tzOffsetMinutes(dateUtc) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(dateUtc);
    const g = (t) => Number(parts.find((p) => p.type === t).value);
    const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
    return Math.round((asUtc - dateUtc.getTime()) / 60000);
  }
  function toDate(day, hm) {
    if (!day || !hm) return null;
    const [y, m, d] = day.split('-').map(Number); const [h, mi] = hm.split(':').map(Number);
    const guess = new Date(Date.UTC(y, m - 1, d, h, mi));
    return new Date(guess.getTime() - tzOffsetMinutes(guess) * 60000);
  }
  const fmtTime = (d) => d ? new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d) : '';
  const fmtDay = (day) => { const d = toDate(day, '12:00'); return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(d); };
  const shortDay = (day) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric' }).format(toDate(day, '12:00'));
  const todayKey = () => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now()); return p; };
  const mins = (ms) => Math.round(ms / 60000);
  function humanIn(ms) {
    const m = Math.max(0, mins(ms)); if (m < 60) return `${m} min`; const h = Math.floor(m / 60); const r = m % 60;
    if (h < 24) return r ? `${h}h ${r}m` : `${h}h`; const d = Math.floor(h / 24); return `${d}d ${h % 24}h`;
  }

  // ---------- vedrí fit scoring ----------
  const KEYWORDS = [
    [4, /\b(video|film|filming|production|studio|camera|virtual production|led volume|green screen|unreal|broadcast|live stream)/i],
    [3, /\b(content|creator|podcast|youtube|short[- ]form|social media|storytell|brand(ing)?|personal brand|audience|reels|tiktok|linkedin video)/i],
    [2, /\b(marketing|demand|positioning|pricing|price|sales|selling|pitch|proposition|niche|oversubscribed|premium|clients?|agency|agencies)/i],
    [2, /\b(\bai\b|artificial intelligence|automation|automate|generative|tools?|workflow|tech)/i],
    [2, /\b(funding|grant|investment|investor|raise|growth|scale|scaling|wales|welsh|regional|creative industr|innovation)/i],
    [1, /\b(network|partnership|referral|b2b|founder|entrepreneur|community|speaking|stage presence|storyteller)/i],
    [0.5, /\b(wellbeing|mental health|mindset|resilience|burnout|energy)/i],
    [-2, /\b(property|crypto|franchise|franchising|employment law|hr compliance|payroll|logistics|dropship|amazon fba)/i],
  ];
  function scoreSession(s) {
    const text = `${s.title} ${(s.speakers || []).join(' ')} ${s.description || ''} ${(s.tags || []).join(' ')} ${s.stage || ''}`;
    let score = 0; for (const [w, re] of KEYWORDS) if (re.test(text)) score += w;
    if ((s.tags || []).includes('headliner')) score += 1;
    return score;
  }
  function fitOf(s) {
    const o = S.local.fitOverride[s.id]; if (o) return { fit: o, why: 'Your override.' };
    const c = S.plan.curation[s.id]; if (c) return c;
    const sc = scoreSession(s);
    if (sc >= 6) return { fit: 'core', why: 'Strong match for vedrí: video, content, brand or production themes.' };
    if (sc >= 3) return { fit: 'good', why: 'Relevant to how vedrí wins and serves clients.' };
    if (sc >= 1) return { fit: 'maybe', why: 'Loosely relevant. Go if it fits the route.' };
    return { fit: 'skip', why: 'Low relevance to the studio. Use the time for networking.' };
  }

  // ---------- Data ----------
  async function fetchJson(path) {
    const r = await fetch(`${path}?v=${Math.floor(Date.now() / 60000)}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`${path} ${r.status}`); return r.json();
  }
  async function loadData() {
    const [ev, se, pl] = await Promise.all([fetchJson('data/event.json'), fetchJson('data/sessions.json'), fetchJson('data/plan.json')]);
    S.event = ev; S.plan = pl; S.sessionsMeta = { updated: se.updated, source: se.source };
    const byId = new Map(); for (const s of se.sessions) byId.set(s.id, normalise(s));
    for (const s of S.local.imported) byId.set(s.id, normalise(s)); // imported overrides seeded
    S.sessions = [...byId.values()].sort(cmp);
    S.day = S.day || (ev.days.includes(todayKey()) ? todayKey() : ev.days[0]);
  }
  function normalise(s) {
    const o = Object.assign({}, s); o.speakers = o.speakers || []; o.tags = o.tags || []; o.startAt = toDate(o.day, o.start); o.endAt = toDate(o.day, o.end) || (o.startAt ? new Date(o.startAt.getTime() + 45 * 60000) : null); return o;
  }
  function cmp(a, b) { if (a.day !== b.day) return a.day < b.day ? -1 : 1; if (!a.startAt && !b.startAt) return a.title.localeCompare(b.title); if (!a.startAt) return 1; if (!b.startAt) return -1; return a.startAt - b.startAt || a.title.localeCompare(b.title); }

  const planIds = () => { const set = new Set([...(S.plan.favourites || []), ...(S.plan.added || []), ...S.local.added]); for (const r of S.local.removed) set.delete(r); return set; };
  const isCommitment = (s) => (s.tags || []).includes('commitment');
  const overlaps = (a, b) => a.day === b.day && a.startAt && b.startAt && a.startAt < b.endAt && b.startAt < a.endAt;
  // Route = core + booked commitments, plus 'good' sessions that don't clash with them. The walkable day.
  function route() {
    const all = planned(); const base = all.filter((s) => fitOf(s).fit === 'core' || isCommitment(s));
    const extra = all.filter((s) => fitOf(s).fit === 'good' && !base.some((b) => overlaps(b, s)));
    const out = [...base]; for (const e of extra) { if (!out.some((b) => overlaps(b, e))) out.push(e); }
    return out.sort(cmp);
  }
  const inPlan = (id) => planIds().has(id);
  function togglePlan(id) {
    const seeded = (S.plan.favourites || []).includes(id) || (S.plan.added || []).includes(id);
    if (inPlan(id)) { if (seeded) S.local.removed.push(id); S.local.added = S.local.added.filter((x) => x !== id); }
    else { S.local.removed = S.local.removed.filter((x) => x !== id); if (!seeded) S.local.added.push(id); }
    save('local', S.local); scheduleReminders(); render();
    toast(inPlan(id) ? 'Added to your plan' : 'Removed from your plan');
  }
  const planned = () => S.sessions.filter((s) => inPlan(s.id));
  const unmatchedFavourites = () => { const ids = new Set(S.sessions.map((s) => s.id)); return (S.plan.favourites || []).filter((f) => !ids.has(f) && !S.local.removed.includes(f)); };
  function clashes(list) {
    const timed = list.filter((s) => s.startAt); const out = new Set();
    for (let i = 0; i < timed.length; i++) for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i], b = timed[j]; if (a.day === b.day && a.startAt < b.endAt && b.startAt < a.endAt) { out.add(a.id); out.add(b.id); }
    } return out;
  }

  // ---------- Rendering ----------
  function render() {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === S.tab));
    const r = { now: renderNow, plan: renderPlan, agenda: renderAgenda, info: renderInfo, settings: renderSettings }[S.tab];
    view.innerHTML = r(); bind();
  }
  function daySeg() {
    return `<div class="seg">${S.event.days.map((d) => `<button data-day="${d}" class="${S.day === d ? 'on' : ''}">${shortDay(d)}</button>`).join('')}</div>`;
  }
  function sessionCard(s, opts = {}) {
    const fit = fitOf(s); const t = now(); const live = s.startAt && t >= s.startAt && t < s.endAt; const past = s.endAt && t >= s.endAt;
    const cls = ['card', 'session', live ? 'now' : '', past && !opts.keepBright ? 'past' : '', opts.clash ? 'clash' : ''].join(' ');
    const time = s.startAt ? `${fmtTime(s.startAt)}<span class="end">${fmtTime(s.endAt)}</span>` : `<span class="tbc">TBC</span>`;
    const badges = [
      live ? '<span class="badge live">On now</span>' : '',
      opts.clash ? '<span class="badge clash">Clash</span>' : '',
      isCommitment(s) ? '<span class="badge core">Booked</span>' : '',
      `<span class="badge ${fit.fit}">${{ core: 'vedrí core', good: 'vedrí fit', maybe: 'maybe', skip: 'skip' }[fit.fit]}</span>`,
      (S.plan.favourites || []).includes(s.id) ? '<span class="badge fav">★ from your Ideas Fest plan</span>' : '',
    ].filter(Boolean).join('');
    return `<article class="${cls}" data-open="${esc(s.id)}">
      <div class="time">${time}</div>
      <div><p class="title">${esc(s.title)}</p><div class="meta"><span class="stage">${esc(s.stage || 'Stage TBC')}</span>${s.speakers.length ? ' · ' + esc(s.speakers.join(', ')) : ''}</div><div class="badges">${badges}</div></div>
      <button class="star ${inPlan(s.id) ? 'on' : ''}" data-star="${esc(s.id)}" aria-label="Toggle plan">${inPlan(s.id) ? '★' : '☆'}</button>
    </article>`;
  }
  function notifyBanner() {
    if (S.settings.notify && Notification.permission === 'granted') return '';
    return `<div class="card warn"><p><strong>Reminders are off.</strong> Turn them on so you get a nudge ${S.settings.lead} minutes before each planned session.</p><div class="row"><button class="btn sm" data-go="settings">Set up reminders</button></div></div>`;
  }

  function renderNow() {
    const t = now(); const ev = S.event; const list = route(); const un = unmatchedFavourites();
    const firstGate = toDate(ev.days[0], ev.hours.gatesOpen); const lastEnd = toDate(ev.days[ev.days.length - 1], '23:00');
    let head = '';
    if (t < firstGate) {
      head = `<div class="card hero"><p class="muted small">Gates open ${fmtDay(ev.days[0])} at ${ev.hours.gatesOpen}</p><div class="countdown">${humanIn(firstGate - t)} <small>to go</small></div><p class="small">${esc(ev.venue.name)} · ${esc(ev.venue.postcode)}. ${esc(ev.travel.fromDocShed)}</p></div>`;
    } else if (t > lastEnd) {
      head = `<div class="card hero"><h1>That's a wrap</h1><p>Ideas Fest 2026 is over. Follow up with everyone you met while it's fresh.</p></div>`;
    } else {
      const live = list.filter((s) => s.startAt && t >= s.startAt && t < s.endAt);
      const next = list.filter((s) => s.startAt && s.startAt > t).slice(0, 3);
      head = live.length ? `<h2>On now</h2>${live.map((s) => sessionCard(s)).join('')}` : '';
      head += next.length ? `<h2>Up next</h2>${next.map((s) => `<div class="gap">In ${humanIn(s.startAt - t)} · ${fmtTime(s.startAt)} at ${esc(s.stage)}</div>${sessionCard(s)}`).join('')}` : `<div class="card"><p>Nothing else planned with a confirmed time today. Browse the agenda for something worth walking to.</p><div class="row"><button class="btn sm secondary" data-go="agenda">Open agenda</button></div></div>`;
      if (!live.length && !next.length) { const onSite = S.sessions.filter((s) => !list.some((r) => r.id === s.id) && s.startAt && s.endAt > t && s.startAt - t < 3 * 3600000).slice(0, 5); if (onSite.length) head += `<h2>Next on site</h2>${onSite.map((s) => sessionCard(s)).join('')}`; }
      const suggest = S.sessions.filter((s) => !list.some((r) => r.id === s.id) && s.startAt && s.startAt > t && s.startAt - t < 90 * 60000 && ['core', 'good'].includes(fitOf(s).fit)).slice(0, 3);
      if (suggest.length) head += `<h2>Worth a detour (next 90 min)</h2>${suggest.map((s) => sessionCard(s)).join('')}`;
    }
    const dataNote = un.length ? `<div class="card"><p><strong>${un.length} of your favourited sessions aren't loaded yet.</strong> The app only has the sessions in its data file. Import the agenda once and they'll appear here with times, stages and reminders.</p><div class="row"><button class="btn sm secondary" data-go="settings">Import agenda</button></div></div>` : '';
    return `${notifyBanner()}${head}${dataNote}`;
  }

  function renderPlan() {
    const mode = S.planMode || 'route';
    const src = mode === 'route' ? route() : planned();
    const list = src.filter((s) => s.day === S.day); const cl = clashes(list); const t = now();
    const timed = list.filter((s) => s.startAt); const tbc = list.filter((s) => !s.startAt);
    let html = `<h1>Your plan</h1>${daySeg()}<div class="chips">${[['route', 'The route'], ['all', 'Everything saved']].map(([k, l]) => `<button class="chip ${mode === k ? 'on' : ''}" data-planmode="${k}">${l}</button>`).join('')}</div>
      ${mode === 'route' ? '<p class="small muted">Core picks and booked slots, plus good sessions that fit between them. Switch to see everything saved and suggested.</p>' : '<p class="small muted">All saved and suggested sessions, clashes and all. Tap one for the verdict.</p>'}`;
    if (!list.length) html += `<div class="list-empty">Nothing planned for ${shortDay(S.day)} yet. Star sessions in the agenda.</div>`;
    let prevEnd = null;
    for (const s of timed) {
      if (prevEnd && s.startAt - prevEnd >= 40 * 60000) html += `<div class="gap">${humanIn(s.startAt - prevEnd)} free · coffee, stands, or a detour</div>`;
      html += sessionCard(s, { clash: cl.has(s.id), keepBright: true }); prevEnd = s.endAt > (prevEnd || 0) ? s.endAt : prevEnd;
    }
    if (tbc.length) html += `<h2>Time to be confirmed</h2>${tbc.map((s) => sessionCard(s, { keepBright: true })).join('')}`;
    const un = unmatchedFavourites();
    if (un.length) html += `<div class="card"><p class="small muted">${un.length} favourites from your Ideas Fest plan link are waiting for agenda data.</p></div>`;
    if (route().some((s) => s.startAt)) html += `<h2>Take it with you</h2><div class="card"><p class="small">Native calendar alarms are the most reliable alerts on a phone. Export the route with a ${S.settings.lead}-minute alarm on every session.</p><div class="row"><button class="btn" data-ics="route">Add the route to Calendar (.ics)</button><button class="btn secondary" data-ics="all">Everything saved (.ics)</button></div></div>`;
    return html;
  }

  function renderAgenda() {
    const f = S.filters; const q = f.q.trim().toLowerCase();
    let list = S.sessions.filter((s) => s.day === S.day);
    if (f.stage !== 'all') list = list.filter((s) => s.stage === f.stage);
    if (f.fit === 'vedri') list = list.filter((s) => ['core', 'good'].includes(fitOf(s).fit));
    if (f.fit === 'plan') list = list.filter((s) => inPlan(s.id));
    if (q) list = list.filter((s) => `${s.title} ${s.speakers.join(' ')} ${s.description || ''} ${s.stage}`.toLowerCase().includes(q));
    const stages = [...new Set(S.sessions.map((s) => s.stage).filter(Boolean))];
    let html = `<h1>Agenda</h1>${daySeg()}<input class="search" id="q" placeholder="Search titles, speakers, topics" value="${esc(f.q)}">
      <div class="chips">${[['all', 'All'], ['vedri', 'Suggested for vedrí'], ['plan', 'My plan']].map(([k, l]) => `<button class="chip ${f.fit === k ? 'on' : ''}" data-fit="${k}">${l}</button>`).join('')}</div>
      <div class="chips">${['all', ...stages].map((st) => `<button class="chip ${f.stage === st ? 'on' : ''}" data-stage="${esc(st)}">${st === 'all' ? 'All stages' : esc(st)}</button>`).join('')}</div>`;
    if (!list.length) html += `<div class="list-empty">No sessions match. ${S.sessions.length < 20 ? 'Only a handful of sessions are loaded. Import the full agenda under Alerts → Import.' : ''}</div>`;
    let lastHour = null;
    for (const s of list) {
      const h = s.startAt ? fmtTime(s.startAt).slice(0, 2) + ':00' : 'Time TBC';
      if (h !== lastHour) { html += `<div class="time-group">${h}</div>`; lastHour = h; }
      html += sessionCard(s);
    }
    return html;
  }

  function renderInfo() {
    const ev = S.event; const p = S.plan.profile || {};
    return `<h1>Info</h1>
      <div class="card hero"><p class="title" style="font-weight:700;font-size:17px;margin:0 0 6px">${esc(ev.venue.name)}</p><p class="small">${esc(ev.venue.address)}, ${esc(ev.venue.postcode)}</p><div class="row"><a class="btn sm" href="${esc(ev.venue.mapsUrl)}" target="_blank" rel="noopener">Open in Maps</a><a class="btn sm secondary" href="${esc(ev.links.info)}" target="_blank" rel="noopener">Official info page</a></div></div>
      <h2>Hours</h2><div class="card"><dl class="kv"><dt>Days</dt><dd>${ev.days.map(fmtDay).join(' and ')}</dd><dt>Gates</dt><dd>${esc(ev.hours.gatesOpen)}</dd><dt>Programme</dt><dd>${esc(ev.hours.programme)}</dd><dt>After Dark</dt><dd>${esc(ev.hours.afterDark)}</dd></dl></div>
      <h2>Getting there</h2><div class="card"><dl class="kv"><dt>From DocShed</dt><dd>${esc(ev.travel.fromDocShed)}</dd><dt>By road</dt><dd>${esc(ev.travel.road)} <a href="${esc(ev.links.parking)}" target="_blank" rel="noopener">Parking</a></dd><dt>By rail</dt><dd>${esc(ev.travel.rail)}</dd></dl></div>
      <h2>Stages and zones</h2><div class="card"><p class="small">${ev.stages.map(esc).join(' · ')}</p><p class="small muted">Headliners announced: ${ev.headliners.map(esc).join(', ')}.</p><a class="btn ghost sm" href="${esc(ev.links.stages)}" target="_blank" rel="noopener">Stage map on ideasfest.uk →</a></div>
      ${ev.you ? `<h2>Your Ideas Fest</h2><div class="card hero"><p class="small"><strong>${esc(ev.you.awards)}</strong></p><p class="small">${esc(ev.you.tickets)}</p></div>
      <div class="card"><p class="small" style="font-weight:600;margin-bottom:6px">Booked</p><ul class="small" style="padding-left:18px;margin:0;line-height:1.6">${(ev.you.bookings || []).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      <p class="small" style="font-weight:600;margin:12px 0 6px">Open offers</p><ul class="small" style="padding-left:18px;margin:0;line-height:1.6">${(ev.you.offers || []).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      <p class="small muted" style="margin-top:12px">${esc(ev.you.concierge)} ${esc(ev.you.workspace)}</p></div>
      <h2>Pack</h2><div class="card"><ul class="small" style="padding-left:18px;margin:0;line-height:1.6">${(ev.you.packing || []).map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
      <h2>Why we're here</h2><div class="card"><p class="small muted">${esc(p.who || '')}</p><ul class="small" style="padding-left:18px;margin:8px 0 0;line-height:1.6">${(p.goals || []).map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>
      <h2>The 15-second intro</h2><div class="card"><p>"We're vedrí, a virtual production studio in North Wales. We shoot on green screen with the final composite live on the monitors, so you walk out with the finished shot, not a post bill. Podcasts, corporate, commercials. We hire in LED volumes when a job needs in-camera. What are you filming this year?"</p><p class="small muted">info@vedri.studio · vedri.studio</p></div>
      <h2>Good to know</h2><div class="card"><ul class="small" style="padding-left:18px;margin:0;line-height:1.6">${ev.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>
      <p class="small muted" style="margin-top:16px">Session data updated ${esc(S.sessionsMeta.updated || '')}. Official agenda: <a href="${esc(ev.links.agenda)}" target="_blank" rel="noopener">ideasfest.uk/agenda-2026</a></p>`;
  }

  function renderSettings() {
    const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const ok = perm === 'granted' && S.settings.notify;
    const un = unmatchedFavourites();
    return `<h1>Alerts</h1>
      <div class="card ${ok ? 'hero' : ''}"><p><span class="status-dot ${ok ? 'ok' : perm === 'denied' ? 'bad' : ''}"></span><strong>${ok ? 'Reminders on' : perm === 'denied' ? 'Notifications blocked in browser settings' : perm === 'unsupported' ? 'This browser cannot show notifications' : 'Reminders off'}</strong></p>
        ${ios && !standalone ? `<p class="small">On iPhone, notifications only work once the app is on your Home Screen: tap <strong>Share</strong> → <strong>Add to Home Screen</strong>, then open it from there and come back here.</p>` : ''}
        <label class="field">Remind me before each planned session</label>
        <select class="search" id="lead">${[5, 10, 15, 20, 30].map((m) => `<option value="${m}" ${S.settings.lead === m ? 'selected' : ''}>${m} minutes before</option>`).join('')}</select>
        <div class="row">${ok ? `<button class="btn secondary" data-act="test">Send test notification</button><button class="btn secondary" data-act="notify-off">Turn off</button>` : `<button class="btn" data-act="notify-on" ${perm === 'denied' || perm === 'unsupported' ? 'disabled' : ''}>Turn on reminders</button>`}</div>
        <p class="small muted" style="margin-top:10px">In-app reminders fire while the app is open or recently used. For alerts you can bank on, also export your plan to your calendar from the Plan tab. Every session there gets a native alarm.</p></div>

      <h2>Install</h2><div class="card">${standalone ? '<p class="small">Installed. You are running as an app.</p>' : `<div class="step"><span class="n">1</span><p class="small">iPhone: Safari → Share → <strong>Add to Home Screen</strong>. Android: Chrome menu → <strong>Install app</strong>.</p></div><div class="step"><span class="n">2</span><p class="small">Open it from the Home Screen and turn reminders on above.</p></div>`}</div>

      <h2>Agenda data</h2><div class="card"><p class="small"><strong>${S.sessions.length}</strong> sessions loaded${S.local.imported.length ? ` (${S.local.imported.length} imported on this device)` : ''}. <strong>${un.length}</strong> of your ${(S.plan.favourites || []).length} favourites still unmatched.</p>
        <p class="small muted">${esc(S.sessionsMeta.source || '')}</p>
        <label class="field">Paste the agenda here (copied text from ideasfest.uk/agenda-2026, or a JSON array of sessions)</label>
        <textarea class="search" id="import-text" placeholder='Copy the whole agenda page and paste it here. Or paste JSON: [{"id":"…","title":"…","day":"2026-09-09","start":"10:00","end":"10:45","stage":"The Main Stage","speakers":["…"]}]'></textarea>
        <div class="row"><button class="btn" data-act="import">Import</button><button class="btn secondary" data-act="import-clear" ${S.local.imported.length ? '' : 'disabled'}>Remove imported</button></div>
        <label class="field">Or paste a plan link from ideasfest.uk (the ?plan=… URL)</label>
        <input class="search" id="plan-url" placeholder="https://ideasfest.uk/agenda-2026?plan=…">
        <div class="row"><button class="btn secondary" data-act="plan-url">Add those to my plan</button></div></div>

      <h2>Reset</h2><div class="card"><p class="small muted">Clears stars, overrides and imported sessions on this device. The seeded plan stays.</p><div class="row"><button class="btn secondary" data-act="reset">Reset local data</button></div></div>
      <p class="small muted">vedrí · Ideas Fest 2026 companion · built for Daniel and the team.</p>`;
  }

  function sheetFor(s) {
    const fit = fitOf(s); const t = now();
    const when = s.startAt ? `${fmtDay(s.day)} · ${fmtTime(s.startAt)}–${fmtTime(s.endAt)}` : `${fmtDay(s.day)} · time to be confirmed`;
    const status = s.startAt ? (t < s.startAt ? `Starts in ${humanIn(s.startAt - t)}` : t < s.endAt ? 'On now' : 'Finished') : '';
    return `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><h1 style="font-size:21px">${esc(s.title)}</h1><button class="btn secondary sm" data-close aria-label="Close">✕</button></div>
      <p class="small" style="color:var(--lime);font-weight:600">${when}${status ? ` · ${status}` : ''}</p>
      <p class="small muted">${esc(s.stage || 'Stage TBC')}${s.speakers.length ? ' · ' + esc(s.speakers.join(', ')) : ''}</p>
      ${s.description ? `<p>${esc(s.description)}</p>` : ''}
      <div class="card"><div class="badges"><span class="badge ${fit.fit}">${{ core: 'vedrí core', good: 'vedrí fit', maybe: 'maybe', skip: 'skip' }[fit.fit]}</span></div><p class="small" style="margin-top:8px">${esc(fit.why)}</p>
        <label class="field">Your call</label><div class="chips" style="margin:0;padding:0">${['core', 'good', 'maybe', 'skip'].map((f) => `<button class="chip ${fit.fit === f ? 'on' : ''}" data-fitset="${f}" data-id="${esc(s.id)}">${f}</button>`).join('')}</div></div>
      <div class="row"><button class="btn ${inPlan(s.id) ? 'secondary' : ''}" data-star="${esc(s.id)}">${inPlan(s.id) ? '★ In your plan · remove' : '☆ Add to plan'}</button></div>
      ${s.startAt ? `<div class="row"><a class="btn secondary sm" target="_blank" rel="noopener" href="${gcalUrl(s)}">Google Calendar</a><button class="btn secondary sm" data-ics="${esc(s.id)}">Apple / .ics</button></div>` : ''}
      <div class="row"><a class="btn ghost sm" href="${esc(s.url || S.event.links.agenda)}" target="_blank" rel="noopener">Open on ideasfest.uk →</a></div>`;
  }
  function openSheet(id) {
    const s = S.sessions.find((x) => x.id === id); if (!s) return;
    $('#sheet-body').innerHTML = sheetFor(s); $('#sheet').hidden = false; bind($('#sheet'));
  }
  function closeSheet() { $('#sheet').hidden = true; if (location.hash.startsWith('#session=')) history.replaceState(null, '', location.pathname + location.search); }

  // ---------- Calendar export ----------
  const pad = (n) => String(n).padStart(2, '0');
  const utcStamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  function gcalUrl(s) {
    const p = new URLSearchParams({ action: 'TEMPLATE', text: `${s.title} · Ideas Fest`, dates: `${utcStamp(s.startAt)}/${utcStamp(s.endAt)}`, details: `${s.speakers.join(', ')}\n${s.description || ''}\n${s.url || ''}`.trim(), location: `${s.stage || ''}, ${S.event.venue.name}, ${S.event.venue.postcode}`, ctz: TZ });
    return `https://calendar.google.com/calendar/render?${p}`;
  }
  function icsFor(list) {
    const esc2 = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//vedri//Ideas Fest 2026//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Ideas Fest 2026 (vedrí plan)', 'X-WR-TIMEZONE:Europe/London'];
    for (const s of list.filter((x) => x.startAt)) {
      lines.push('BEGIN:VEVENT', `UID:${s.id}@ideasfest.vedri.studio`, `DTSTAMP:${utcStamp(new Date())}`, `DTSTART:${utcStamp(s.startAt)}`, `DTEND:${utcStamp(s.endAt)}`,
        `SUMMARY:${esc2(s.title)}`, `LOCATION:${esc2(`${s.stage || ''}, ${S.event.venue.name}, ${S.event.venue.postcode}`)}`, `DESCRIPTION:${esc2(`${s.speakers.join(', ')}\n${s.description || ''}\n${s.url || ''}`)}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc2(s.title)} starts in ${S.settings.lead} minutes`, `TRIGGER:-PT${S.settings.lead}M`, 'END:VALARM', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR'); return lines.join('\r\n');
  }
  function downloadIcs(list, name) {
    const blob = new Blob([icsFor(list)], { type: 'text/calendar;charset=utf-8' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
    toast('Calendar file ready. Open it and tap Add All.');
  }

  // ---------- Reminders ----------
  function reminderItems() {
    const lead = S.settings.lead * 60000;
    return route().filter((s) => s.startAt).map((s) => ({ id: `rem-${s.id}-${S.settings.lead}`, sessionId: s.id, at: s.startAt.getTime() - lead, title: `${s.title}`, body: `Starts in ${S.settings.lead} min · ${s.stage || ''} · ${fmtTime(s.startAt)}` }));
  }
  function scheduleReminders() {
    if (!S.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    const items = reminderItems();
    if (S.swReg && S.swReg.active) S.swReg.active.postMessage({ type: 'schedule', items: items.map((i) => ({ ...i, at: overrideBase ? Date.now() + (i.at - now().getTime()) : i.at })) });
  }
  function tickReminders() {
    if (!S.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    const t = now().getTime();
    for (const it of reminderItems()) {
      if (S.local.fired[it.id]) continue; if (t < it.at || t > it.at + 3 * 60000) continue;
      S.local.fired[it.id] = 1; save('local', S.local); showNotification(it.title, it.body, it.sessionId);
    }
  }
  async function showNotification(title, body, sessionId) {
    const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: sessionId || 'ifv', data: { sessionId }, vibrate: [120, 60, 120] };
    try { if (S.swReg) return await S.swReg.showNotification(title, opts); } catch { /* fall through */ }
    try { new Notification(title, opts); } catch { toast(`${title} · ${body}`); }
  }
  async function enableNotifications() {
    if (!('Notification' in window)) return toast('This browser cannot show notifications.');
    const p = await Notification.requestPermission();
    if (p !== 'granted') { toast('Permission not granted. Check browser settings.'); render(); return; }
    S.settings.notify = true; save('settings', S.settings); scheduleReminders(); render();
    showNotification('Reminders on', `You'll get a nudge ${S.settings.lead} minutes before each planned session.`);
  }

  // ---------- Import ----------
  function importText(text) {
    text = text.trim(); if (!text) return 0;
    let items = [];
    if (text.startsWith('[') || text.startsWith('{')) {
      const j = JSON.parse(text); items = Array.isArray(j) ? j : (j.sessions || []);
    } else items = parseAgendaText(text);
    items = items.filter((s) => s && s.title && s.day).map((s) => ({ id: s.id || slug(`${s.day}-${s.start || 'tbc'}-${s.title}`), title: s.title.trim(), speakers: s.speakers || [], day: s.day, start: s.start || null, end: s.end || null, stage: s.stage || '', description: s.description || '', tags: s.tags || [], url: s.url || S.event.links.agenda }));
    if (!items.length) return 0;
    const map = new Map(S.local.imported.map((s) => [s.id, s])); for (const s of items) map.set(s.id, s);
    S.local.imported = [...map.values()]; save('local', S.local); return items.length;
  }
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  function parseAgendaText(text) {
    // Heuristic parser for copied agenda text: day headings, "10:00 - 10:45" time ranges, stage names, then a title line.
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const days = S.event.days; let day = days[0]; const stages = S.event.stages; const out = [];
    const timeRe = /(\d{1,2})[:.](\d{2})\s*(am|pm)?\s*(?:-|–|—|to)\s*(\d{1,2})[:.](\d{2})\s*(am|pm)?/i;
    const to24 = (h, m, ap, otherAp) => { h = Number(h); const a = (ap || otherAp || '').toLowerCase(); if (a === 'pm' && h < 12) h += 12; if (a === 'am' && h === 12) h = 0; if (!a && h < 8) h += 12; return `${pad(h)}:${m}`; };
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const dayHit = days.find((d) => { const dd = toDate(d, '12:00'); const n = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric' }).format(dd); const w = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long' }).format(dd); return new RegExp(`\\b${w}\\b`, 'i').test(l) || new RegExp(`\\b${n}(st|nd|rd|th)?\\s+sept`, 'i').test(l); });
      if (dayHit && l.length < 60) { day = dayHit; continue; }
      const m = l.match(timeRe); if (!m) continue;
      const start = to24(m[1], m[2], m[3], m[6]); const end = to24(m[4], m[5], m[6], m[3]);
      const rest = l.replace(timeRe, '').replace(/^[\s\-–—|·:]+|[\s\-–—|·:]+$/g, '');
      let title = rest, stage = '', speakers = [];
      let window = lines.slice(i + 1, i + 6); const nextT = window.findIndex((w) => timeRe.test(w)); if (nextT >= 0) window = window.slice(0, nextT);
      for (const w of window) { const st = stages.find((s) => w.toLowerCase().includes(s.toLowerCase().split(',')[0])); if (st && !stage) stage = st; }
      if (!title || timeRe.test(title) || title.length < 4) { title = window.find((w) => !timeRe.test(w) && !stages.some((s) => w.toLowerCase() === s.toLowerCase()) && w.length > 3) || ''; }
      const stIdx = window.findIndex((w) => stage && w.toLowerCase().includes(stage.toLowerCase().split(',')[0]));
      const cand = window.filter((w, k) => k !== stIdx && w !== title && !timeRe.test(w) && w.length < 80 && /^[A-Z][^.!?]{2,60}$/.test(w) && !days.some((d) => new RegExp(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long' }).format(toDate(d, '12:00')), 'i').test(w)));
      if (cand.length) speakers = cand.slice(0, 3);
      if (title) out.push({ title, day, start, end, stage, speakers });
    }
    return out;
  }
  function importPlanUrl(url) {
    const ids = (url.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || []).map((x) => x.toLowerCase());
    for (const id of ids) { if (!inPlan(id)) { S.local.removed = S.local.removed.filter((x) => x !== id); if (!(S.plan.favourites || []).includes(id)) S.local.added.push(id); } }
    save('local', S.local); return ids.length;
  }

  // ---------- Events ----------
  function bind(root = view) {
    root.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => { S.day = b.dataset.day; render(); });
    root.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => { S.tab = b.dataset.go; render(); });
    root.querySelectorAll('[data-open]').forEach((c) => c.onclick = (e) => { if (e.target.closest('[data-star]')) return; location.hash = 'session=' + c.dataset.open; openSheet(c.dataset.open); });
    root.querySelectorAll('[data-star]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); togglePlan(b.dataset.star); if (!$('#sheet').hidden) openSheet(b.dataset.star); });
    root.querySelectorAll('[data-fitset]').forEach((b) => b.onclick = () => { S.local.fitOverride[b.dataset.id] = b.dataset.fitset; save('local', S.local); openSheet(b.dataset.id); });
    root.querySelectorAll('[data-planmode]').forEach((b) => b.onclick = () => { S.planMode = b.dataset.planmode; render(); });
    root.querySelectorAll('[data-ics]').forEach((b) => b.onclick = () => { const id = b.dataset.ics; if (id === 'all') downloadIcs(planned(), 'ideas-fest-2026-vedri-all.ics'); else if (id === 'route') downloadIcs(route(), 'ideas-fest-2026-vedri-route.ics'); else { const s = S.sessions.find((x) => x.id === id); if (s) downloadIcs([s], slug(s.title) + '.ics'); } });
    root.querySelectorAll('[data-fit]').forEach((b) => b.onclick = () => { S.filters.fit = b.dataset.fit; render(); });
    root.querySelectorAll('[data-stage]').forEach((b) => b.onclick = () => { S.filters.stage = b.dataset.stage; render(); });
    const q = root.querySelector('#q'); if (q) q.oninput = () => { S.filters.q = q.value; const list = renderAgenda(); view.innerHTML = list; bind(); const nq = $('#q'); nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); };
    const lead = root.querySelector('#lead'); if (lead) lead.onchange = () => { S.settings.lead = Number(lead.value); save('settings', S.settings); scheduleReminders(); render(); };
    root.querySelectorAll('[data-act]').forEach((b) => b.onclick = async () => {
      const a = b.dataset.act;
      if (a === 'notify-on') return enableNotifications();
      if (a === 'notify-off') { S.settings.notify = false; save('settings', S.settings); if (S.swReg && S.swReg.active) S.swReg.active.postMessage({ type: 'schedule', items: [] }); render(); }
      if (a === 'test') showNotification('Reminders are working', `This is what you'll see ${S.settings.lead} minutes before a session.`);
      if (a === 'import') { try { const n = importText($('#import-text').value); if (!n) return toast('Nothing recognised. Try pasting JSON or the copied agenda text.'); await loadData(); scheduleReminders(); render(); toast(`Imported ${n} session${n === 1 ? '' : 's'}`); } catch (e) { toast('Import failed: ' + e.message); } }
      if (a === 'import-clear') { S.local.imported = []; save('local', S.local); await loadData(); render(); toast('Imported sessions removed'); }
      if (a === 'plan-url') { const n = importPlanUrl($('#plan-url').value); render(); toast(n ? `${n} session IDs added to your plan` : 'No session IDs found in that link'); }
      if (a === 'reset') { if (confirm('Clear stars, overrides and imported sessions on this device?')) { localStorage.removeItem('ifv.local'); S.local = { added: [], removed: [], imported: [], fitOverride: {}, fired: {} }; await loadData(); render(); } }
    });
    root.querySelectorAll('[data-close]').forEach((b) => b.onclick = closeSheet);
  }
  document.querySelectorAll('.tab').forEach((t) => t.onclick = () => { S.tab = t.dataset.tab; closeSheet(); render(); window.scrollTo(0, 0); });

  let toastT; function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2800); }
  function tickClock() { $('#clock').textContent = fmtTime(now()); }

  // ---------- Boot ----------
  async function boot() {
    try { await loadData(); } catch (e) { view.innerHTML = `<div class="card warn"><p>Could not load event data (${esc(e.message)}). If you opened index.html directly, serve the folder over HTTP instead.</p></div>`; return; }
    const h = new URLSearchParams(location.hash.slice(1)); if (h.get('tab')) S.tab = h.get('tab');
    render(); tickClock(); setInterval(tickClock, 15000); setInterval(() => { tickReminders(); if (S.tab === 'now') render(); }, 30000); tickReminders();
    if (h.get('session')) openSheet(h.get('session'));
    if ('serviceWorker' in navigator) {
      try { S.swReg = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; scheduleReminders(); } catch (e) { console.warn('SW failed', e); }
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { tickReminders(); scheduleReminders(); if (S.tab === 'now') render(); } });
    window.addEventListener('hashchange', () => { const p = new URLSearchParams(location.hash.slice(1)); if (p.get('session')) openSheet(p.get('session')); });
  }
  boot();
})();
