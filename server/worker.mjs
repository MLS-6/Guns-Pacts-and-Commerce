/* =====================================================================
   Guns, Pacts, and Commerce — campaign server (Cloudflare Worker)

   - Static files in /public (the game page, rules.js, engine.js) are served
     by Cloudflare directly.
   - Everything under /api/ goes to one Durable Object, "Campaign", which
     holds the single running campaign: the game state, each player's PIN and
     the orders submitted for the current turn.
   - A cron trigger pokes the Campaign every hour; it resolves the turn at
     RESOLVE_HOUR in TIME_ZONE (10 PM New York by default).

   Settings (wrangler.jsonc "vars"):  RESOLVE_HOUR, TIME_ZONE, MIN_TURN_HOURS
   Secret (Cloudflare dashboard):      ADMIN_PIN
   ===================================================================== */
import Engine from '../public/engine.js';

const KEEP_REPORT_TURNS = 15; // older reports are dropped to keep the save small
const MAX_ORDERS_BYTES = 300000;
const CHUNK = 900000; // state is stored in pieces under 1 MB

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const fail = (status, error, extra) => json(Object.assign({ error }, extra || {}), status);

/* ---------------- the Worker: routes /api/* to the Campaign ---------------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return campaign(env).fetch(request);
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(campaign(env).fetch('https://campaign.internal/_tick', { method: 'POST' }));
  },
};
const campaign = (env) => env.CAMPAIGN.get(env.CAMPAIGN.idFromName('main'));

/* ---------------- time helpers ---------------- */
function localParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

/* ---------------- the Campaign (Durable Object) ---------------- */
export class Campaign {
  constructor(state, env) {
    this.storage = state.storage;
    this.env = env;
    this.fails = new Map(); // ip -> [timestamps] for wrong-PIN throttling
  }

  settings() {
    const e = this.env || {};
    return {
      hour: Number.isFinite(Number(e.RESOLVE_HOUR)) ? Number(e.RESOLVE_HOUR) : 22,
      tz: e.TIME_ZONE || 'America/New_York',
      minHours: Number.isFinite(Number(e.MIN_TURN_HOURS)) ? Number(e.MIN_TURN_HOURS) : 12,
    };
  }

  /* ----- storage ----- */
  async loadState() {
    const n = await this.storage.get('state:n');
    if (!n) return null;
    const parts = await this.storage.get(Array.from({ length: n }, (_, i) => `state:${i}`));
    let s = '';
    for (let i = 0; i < n; i++) s += parts.get(`state:${i}`) || '';
    const S = JSON.parse(s);
    Engine.migrate(S);
    return S;
  }
  async saveState(S) {
    const s = JSON.stringify(S), n = Math.max(1, Math.ceil(s.length / CHUNK)), entries = { 'state:n': n };
    for (let i = 0; i < n; i++) entries[`state:${i}`] = s.slice(i * CHUNK, (i + 1) * CHUNK);
    await this.storage.put(entries);
    const old = (await this.storage.get('state:max')) || 0;
    if (old > n) await this.storage.delete(Array.from({ length: old - n }, (_, i) => `state:${n + i}`));
    await this.storage.put('state:max', n);
  }
  async getPins() { return (await this.storage.get('pins')) || []; }
  async getOrders() { return (await this.storage.get('orders')) || {}; }
  async getMeta() { return (await this.storage.get('meta')) || {}; }

  /* ----- who is asking ----- */
  async who(request) {
    const pin = String(request.headers.get('X-Pin') || '').trim();
    const adminPin = String(request.headers.get('X-Admin-Pin') || '').trim();
    const ADMIN = String((this.env && this.env.ADMIN_PIN) || '').trim();
    const pins = await this.getPins();
    const you = { role: null, pid: null, admin: false };
    if (ADMIN && (adminPin === ADMIN || pin === ADMIN)) you.admin = true;
    if (pin && pin !== ADMIN) { const pid = pins.indexOf(pin); if (pid >= 0) { you.pid = pid; you.role = 'player'; } }
    if (!you.role && you.admin) you.role = 'admin';
    return you;
  }
  throttled(request) {
    const ip = request.headers.get('CF-Connecting-IP') || 'local', now = Date.now();
    const list = (this.fails.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
    this.fails.set(ip, list);
    return list.length >= 10;
  }
  noteFail(request) { const ip = request.headers.get('CF-Connecting-IP') || 'local'; (this.fails.get(ip) || this.fails.set(ip, []).get(ip)).push(Date.now()); }

  /* ----- what a player sees ----- */
  async payload(you, S) {
    S = S || (await this.loadState());
    const orders = await this.getOrders(), meta = await this.getMeta(), set = this.settings();
    const pending = {};
    if (S) for (const [pid, o] of Object.entries(orders)) {
      if (o.turn !== S.turn) continue;
      pending[pid] = { turn: o.turn, at: o.at };
      if (Number(pid) === you.pid) pending[pid].orders = o.orders; // only your own orders come back
    }
    return { state: S, pending, you, schedule: { hour: set.hour, tz: set.tz, minHours: set.minHours, turnOpenedAt: meta.turnOpenedAt || null, lastResolve: meta.lastResolve || null } };
  }

  /* ----- resolving ----- */
  async resolve(how) {
    const S = await this.loadState();
    if (!S) return { error: 'There is no campaign running.' };
    if (S.gameOver) return { error: 'The campaign is over.' };
    const all = await this.getOrders(), orders = {};
    for (const [pid, o] of Object.entries(all)) if (o.turn === S.turn) orders[pid] = o.orders;
    const NS = Engine.resolveTurn(S, orders);
    for (const pid of Object.keys(NS.reports || {})) NS.reports[pid] = (NS.reports[pid] || []).filter((r) => r.turn >= NS.turn - KEEP_REPORT_TURNS);
    await this.saveState(NS);
    await this.storage.put('orders', {});
    const meta = await this.getMeta();
    meta.turnOpenedAt = Date.now();
    meta.lastResolve = { turn: S.turn, at: Date.now(), how, submitted: Object.keys(orders).length };
    await this.storage.put('meta', meta);
    return { state: NS };
  }

  async tick() {
    const S = await this.loadState();
    if (!S || S.gameOver) return json({ ok: true, skipped: 'no campaign' });
    const set = this.settings(), now = new Date(), { day, hour } = localParts(now, set.tz);
    const meta = await this.getMeta();
    if (hour < set.hour || meta.lastAutoDay === day) return json({ ok: true, skipped: 'not time' });
    meta.lastAutoDay = day;
    await this.storage.put('meta', meta);
    // A turn opened only recently (e.g. the host resolved by hand this evening) runs until tomorrow.
    if (meta.turnOpenedAt && now - meta.turnOpenedAt < set.minHours * 3600 * 1000) return json({ ok: true, skipped: 'turn too new' });
    const r = await this.resolve('auto');
    return json({ ok: !r.error, turn: r.state ? r.state.turn : null });
  }

  /* ----- requests ----- */
  async fetch(request) {
    const url = new URL(request.url), path = url.pathname.replace(/^\/api/, ''), method = request.method;
    try {
      if (path === '/_tick' && method === 'POST' && url.hostname === 'campaign.internal') return await this.tick();
      if (this.throttled(request)) return fail(429, 'Too many wrong PINs. Wait ten minutes and try again.');
      const you = await this.who(request);
      const body = method === 'GET' ? null : await request.text();
      if (body && body.length > 5e6) return fail(413, 'That request is too large.');
      const data = body ? JSON.parse(body) : {};

      if (path === '/login' && method === 'POST') {
        const pin = String(data.pin || '').trim();
        if (!pin) return fail(400, 'Enter a PIN.');
        const ADMIN = String((this.env && this.env.ADMIN_PIN) || '').trim();
        if (ADMIN && pin === ADMIN) return json({ role: 'admin', pid: null, admin: true });
        const pins = await this.getPins(), pid = pins.indexOf(pin);
        if (pid < 0) { this.noteFail(request); return fail(401, pins.length ? 'That PIN is not recognised.' : 'No campaign has been started yet, so only the admin PIN works.'); }
        const S = await this.loadState();
        return json({ role: 'player', pid, admin: false, name: S && S.players[pid] ? S.players[pid].name : '' });
      }

      if (!you.role) { if (request.headers.get('X-Pin') || request.headers.get('X-Admin-Pin')) this.noteFail(request); return fail(401, 'Enter your PIN.'); }

      if (path === '/game' && method === 'GET') {
        const S = await this.loadState();
        if (!S) return fail(404, 'No campaign is running yet.', { you, schedule: (await this.payload(you, null)).schedule });
        return json(await this.payload(you, S));
      }

      if (path === '/orders' && method === 'PUT') {
        if (you.role !== 'player') return fail(403, 'Log in with your player PIN to submit orders.');
        const S = await this.loadState();
        if (!S) return fail(404, 'No campaign is running yet.');
        if (S.gameOver) return fail(409, 'The campaign is over.');
        if (S.players[you.pid] && S.players[you.pid].eliminated) return fail(409, 'Your nation is out of the game.');
        if (Number(data.turn) !== S.turn) return fail(409, `Those orders are for turn ${data.turn}, but it is now turn ${S.turn}. Reload the page.`);
        if (JSON.stringify(data.orders || {}).length > MAX_ORDERS_BYTES) return fail(413, 'Those orders are too large.');
        const orders = await this.getOrders();
        orders[you.pid] = { turn: S.turn, at: Date.now(), orders: Engine.normalizeOrders(data.orders || {}) };
        await this.storage.put('orders', orders);
        return json(await this.payload(you, S));
      }

      // ----- admin only from here -----
      if (!you.admin) return fail(403, 'That needs the admin PIN.');

      if (path === '/resolve' && method === 'POST') {
        const S = await this.loadState();
        if (S && data.turn != null && Number(data.turn) !== S.turn) return fail(409, `Turn ${data.turn} has already been resolved.`);
        const r = await this.resolve('admin');
        if (r.error) return fail(409, r.error);
        return json(await this.payload(you, r.state));
      }

      if (path === '/campaign' && method === 'POST') {
        const S = data.state, pins = (data.pins || []).map((p) => String(p || '').trim());
        if (!S || !Array.isArray(S.players) || !S.map) return fail(400, 'That is not a game.');
        if (pins.length !== S.players.length) return fail(400, 'Every player needs a PIN.');
        const ADMIN = String((this.env && this.env.ADMIN_PIN) || '').trim();
        if (pins.some((p) => !/^\d{4,10}$/.test(p))) return fail(400, 'PINs must be 4 to 10 digits.');
        if (new Set(pins).size !== pins.length) return fail(400, 'Every player needs a different PIN.');
        if (pins.includes(ADMIN)) return fail(400, 'A player PIN cannot be the same as the admin PIN.');
        if ((await this.loadState()) && !data.replace) return fail(409, 'A campaign is already running.', { exists: true });
        Engine.migrate(S);
        await this.saveState(S);
        await this.storage.put('pins', pins);
        await this.storage.put('orders', {});
        await this.storage.put('meta', { turnOpenedAt: Date.now(), startedAt: Date.now() });
        return json(await this.payload(you, S));
      }

      if (path === '/state' && method === 'PUT') {
        // replace the running game from a saved file, keeping everyone's PINs
        const S = data.state;
        if (!S || !Array.isArray(S.players) || !S.map) return fail(400, 'That is not a game.');
        const pins = await this.getPins();
        if (pins.length !== S.players.length) return fail(400, `That game has ${S.players.length} players but this campaign has ${pins.length} PINs. Start a new campaign instead.`);
        Engine.migrate(S);
        await this.saveState(S);
        await this.storage.put('orders', {});
        const meta = await this.getMeta(); meta.turnOpenedAt = Date.now(); await this.storage.put('meta', meta);
        return json(await this.payload(you, S));
      }

      if (path === '/pins' && method === 'GET') {
        const S = await this.loadState(), pins = await this.getPins();
        return json({ pins: pins.map((pin, pid) => ({ pid, pin, name: S && S.players[pid] ? S.players[pid].name : `Player ${pid + 1}` })) });
      }

      if (path === '/pins' && method === 'PUT') {
        const pid = Number(data.pid), pin = String(data.pin || '').trim(), pins = await this.getPins();
        if (!(pid >= 0 && pid < pins.length)) return fail(400, 'No such player.');
        if (!/^\d{4,10}$/.test(pin)) return fail(400, 'PINs must be 4 to 10 digits.');
        if (pins.some((p, i) => p === pin && i !== pid) || pin === String(this.env.ADMIN_PIN || '')) return fail(400, 'That PIN is already in use.');
        pins[pid] = pin; await this.storage.put('pins', pins);
        return json({ ok: true });
      }

      if (path === '/campaign' && method === 'DELETE') {
        await this.storage.deleteAll();
        return json({ ok: true });
      }

      return fail(404, 'Unknown request.');
    } catch (e) {
      return fail(500, `Server error: ${e.message}`);
    }
  }
}
