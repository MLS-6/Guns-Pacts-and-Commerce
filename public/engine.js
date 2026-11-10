/* =====================================================================
   SUPPLY LINES — GAME ENGINE
   Map generation, rule queries and turn resolution. No DOM access, so it
   runs the same in the browser and in Node (for a server or tests).
   ===================================================================== */
const Engine = ((R) => {
  'use strict';
  const GOODS = R.GOODS, B = R.BUILDINGS, U = R.UNITS, TT = R.TILES;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const sum = (o) => Object.values(o || {}).reduce((a, b) => a + b, 0);
  const goodsText = (o) => Object.entries(o || {}).filter(([, v]) => v > 0).map(([g, v]) => `${v} ${(R.GOOD_NAMES[g] || g).toLowerCase()}`).join(', ') || 'nothing';

  /* ---------------- random numbers ---------------- */
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed(s) {
    if (typeof s === 'number') return s >>> 0;
    let h = 2166136261;
    for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function shuffle(arr, rng) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

  /* ---------------- hex grid: pointy-top, odd rows shifted right ----------------
     Direction k matches hex edge k (0 = east, then clockwise on screen). */
  const DIRS_EVEN = [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]];
  const DIRS_ODD = [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]];
  const idx = (m, c, r) => (c < 0 || r < 0 || c >= m.w || r >= m.h ? -1 : r * m.w + c);
  const colRow = (m, i) => [i % m.w, Math.floor(i / m.w)];
  function dirs(m, i) { const [c, r] = colRow(m, i); return ((r & 1) ? DIRS_ODD : DIRS_EVEN).map(([dc, dr]) => idx(m, c + dc, r + dr)); }
  const nbrs = (m, i) => dirs(m, i).filter((j) => j >= 0);
  function cube(m, i) { const [c, r] = colRow(m, i); const x = c - (r - (r & 1)) / 2; return [x, r, -x - r]; }
  function dist(m, a, b) { const A = cube(m, a), C = cube(m, b); return Math.max(Math.abs(A[0] - C[0]), Math.abs(A[1] - C[1]), Math.abs(A[2] - C[2])); }
  function within(m, i, rad) {
    const out = [i], seen = new Set([i]);
    let frontier = [i];
    for (let d = 0; d < rad; d++) {
      const next = [];
      for (const t of frontier) for (const j of nbrs(m, t)) if (!seen.has(j)) { seen.add(j); next.push(j); out.push(j); }
      frontier = next;
    }
    return out;
  }
  const terrain = (S, t) => TT[S.map.tiles[t].type].terrain;
  const isWater = (S, t) => terrain(S, t) === 'water';
  const isLand = (S, t) => terrain(S, t) === 'land';
  const nearWater = (S, t) => nbrs(S.map, t).some((j) => isWater(S, j));
  const tileLabel = (S, t) => { const [c, r] = colRow(S.map, t); return `${c},${r}`; };

  /* ---------------- map generation ----------------
     Every map type builds a "landness" score per tile, then the highest-scoring
     share of tiles becomes land, so each type hits its land share exactly.
     Tiles forced to ocean (map edge, gaps between landmasses) score -Infinity. */
  const LAND_SHARE = { pangea: 0.5, continents: 0.5, islands: 0.42, oldNew: 0.58, mediterranean: 0.66, landlocked: 1 };
  function genMap(nPlayers, rng, opts = {}) {
    const type = R.MAP.types[opts.mapType] ? opts.mapType : R.MAP.type;
    const tpp = R.MAP.sizes.includes(Number(opts.tilesPerPlayer)) ? Number(opts.tilesPerPlayer) : R.MAP.tilesPerPlayer;
    const N = nPlayers * tpp;
    const aspect = type === 'oldNew' ? 1.7 : 1.35;
    const w = Math.max(12, Math.round(Math.sqrt(N * aspect)));
    const h = Math.max(9, Math.ceil(N / w));
    const m = { w, h, tiles: [], type, tilesPerPlayer: tpp };
    const n = w * h;
    const noise = (scale) => {
      const gw = Math.ceil(w / scale) + 3, gh = Math.ceil(h / scale) + 3, g = [];
      for (let k = 0; k < gw * gh; k++) g.push(rng());
      const sm = (t) => t * t * (3 - 2 * t);
      return (c, r) => {
        const x = (c + 0.5 * (r & 1)) / scale, y = r / scale;
        const x0 = Math.floor(x), y0 = Math.floor(y), fx = sm(x - x0), fy = sm(y - y0);
        const v = (a, b) => g[b * gw + a];
        return (v(x0, y0) * (1 - fx) + v(x0 + 1, y0) * fx) * (1 - fy) + (v(x0, y0 + 1) * (1 - fx) + v(x0 + 1, y0 + 1) * fx) * fy;
      };
    };
    const big = Math.max(4, Math.sqrt(N) / 4.5);
    // Z: how "zoomed in" the map is. More tiles per player = the same world at a
    // larger scale, so lakes, forests, ore fields and coastline features get bigger.
    const Z = Math.sqrt(tpp / 200);
    const e1 = noise(big), e2 = noise(big / 2), e3 = noise(1.6), m1 = noise(1 + 5 * Z), m2 = noise(0.6 + 2.2 * Z);
    const c1 = noise(Math.max(2.5, 5 * Z)), c2 = noise(Math.max(1.4, 2.4 * Z)), c3 = noise(1.2);
    const wx = noise(big * 0.9), wy = noise(big * 0.9);
    const r1 = noise(Math.max(4, 8 * Z)), r2 = noise(Math.max(3, 5 * Z)), gate = noise(Math.max(1.8, 2.6 * Z));
    const oreN = noise(1 + 3 * Z), coalN = noise(1 + 3 * Z);
    // coastline detail: bays, capes and peninsulas
    const detail = (c, r) => (c1(c, r) - 0.5) + 0.55 * (c2(c, r) - 0.5) + 0.25 * (c3(c, r) - 0.5);
    const pos = (i) => { const c = i % w, r = Math.floor(i / w); return [c + 0.5 * (r & 1), r * 0.866]; };
    const W = w + 0.5, HH = (h - 1) * 0.866 + 1;
    const small = Math.max(0.5, Math.min(1, Math.sqrt(N) / 28)); // tighter margins on tiny maps
    const wob = (c, r) => 0.72 + 0.5 * e1(c, r) + 0.28 * (e3(c, r) - 0.5);
    const edgeOf = (x, y) => Math.min(x, W - x, y, HH - y);
    const score = new Array(n).fill(-Infinity);
    // blobs: nearest centre wins; tiles about equally close to two centres stay ocean
    const blobs = (centers, gap) => {
      for (let i = 0; i < n; i++) {
        const c = i % w, r = Math.floor(i / w), [x0, y0] = pos(i);
        if (edgeOf(x0, y0) < 1.3 * small) continue;
        const x = x0 + (wx(c, r) - 0.5) * W * 0.22, y = y0 + (wy(c, r) - 0.5) * HH * 0.22;
        let d1 = Infinity, d2 = Infinity;
        for (const [cx, cy, sx = 1, sy = 1] of centers) {
          const d = Math.hypot((x - cx) / sx, (y - cy) / sy);
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
        if (d2 - d1 < gap * small) continue;
        score[i] = -d1 / wob(c, r);
      }
    };
    const jit = (v, amt) => v + (rng() - 0.5) * amt;
    if (type === 'pangea') {
      blobs([[jit(W / 2, W * 0.06), jit(HH / 2, HH * 0.06), W / HH, 1]], 0);
    } else if (type === 'continents') {
      const tri = W >= HH
        ? [[0.2, 0.3], [0.5, 0.72], [0.8, 0.3]]
        : [[0.3, 0.2], [0.72, 0.5], [0.3, 0.8]];
      const order = shuffle([0, 1, 2], rng);
      blobs(order.map((k) => [jit(tri[k][0] * W, W * 0.08), jit(tri[k][1] * HH, HH * 0.08)]), 2.6);
    } else if (type === 'islands') {
      const K = Math.max(nPlayers + 2, Math.min(40, Math.round((N * LAND_SHARE.islands) / 45)));
      const centers = [];
      const minD = Math.sqrt((W * HH) / K) * 0.75;
      for (let tries = 0; centers.length < K && tries < 4000; tries++) {
        const x = 2 + rng() * (W - 4), y = 2 + rng() * (HH - 4);
        if (centers.every(([cx, cy]) => Math.hypot(x - cx, y - cy) > minD * (tries > 2000 ? 0.7 : 1))) centers.push([x, y]);
      }
      blobs(centers, 2.2);
    } else if (type === 'oldNew') {
      for (let i = 0; i < n; i++) {
        const c = i % w, r = Math.floor(i / w), [x, y] = pos(i);
        const off = (e2(c, r) - 0.5) * W * 0.12; // coastlines wander east and west
        if (Math.abs(x - W / 2 - off * 0.5) < 1.6) continue; // the ocean between the two worlds
        const cx = x < W / 2 + off * 0.5 ? W * 0.25 : W * 0.75;
        score[i] = -Math.abs(x - cx - off) / (wob(c, r) * W * 0.25) - 0.15 * Math.abs(y / HH - 0.5);
      }
    } else if (type === 'mediterranean') {
      const cx = jit(W / 2, W * 0.05), cy = jit(HH / 2, HH * 0.05);
      for (let i = 0; i < n; i++) {
        const c = i % w, r = Math.floor(i / w), [x, y] = pos(i);
        score[i] = Math.hypot((x - cx) / W, (y - cy) / HH) * wob(c, r);
      }
    } else {
      for (let i = 0; i < n; i++) score[i] = 0;
    }
    const share = LAND_SHARE[type];
    if (share < 1) {
      // roughen every coastline in proportion to how spread out the scores are
      const fin = score.filter((v) => v > -Infinity), mean = fin.reduce((a, v) => a + v, 0) / fin.length;
      const sd = Math.sqrt(fin.reduce((a, v) => a + (v - mean) * (v - mean), 0) / fin.length) || 1;
      for (let i = 0; i < n; i++) if (score[i] > -Infinity) score[i] += detail(i % w, Math.floor(i / w)) * sd * 0.95;
    }
    const finite = score.filter((v) => v > -Infinity).sort((a, b) => b - a);
    const cut = share >= 1 ? -Infinity : finite[Math.min(finite.length - 1, Math.floor(n * share))];
    const isLandT = (i) => score[i] > -Infinity && (share >= 1 || score[i] >= cut);
    const land = new Array(n);
    for (let i = 0; i < n; i++) land[i] = isLandT(i);
    const tmp = { w, h };
    // Small islands scattered through open ocean
    if (share < 1) {
      const nearLand = (i, d) => within(tmp, i, d).some((j) => land[j]);
      const wantIsles = Math.round(N / (type === 'islands' ? 260 : 160));
      for (let k = 0, made = 0; k < wantIsles * 40 && made < wantIsles; k++) {
        const i = Math.floor(rng() * n), [x, y] = pos(i);
        if (land[i] || edgeOf(x, y) < 1.5 || nearLand(i, 2)) continue;
        const size = 1 + Math.floor(rng() * rng() * (4 + 4 * Z));
        const isle = [i]; land[i] = true;
        for (let g = 1; g < size; g++) {
          const from = isle[Math.floor(rng() * isle.length)];
          const opts = nbrs(tmp, from).filter((j) => !land[j] && edgeOf(...pos(j)) >= 1.5 && !nbrs(tmp, j).some((q) => land[q] && !isle.includes(q)));
          if (!opts.length) continue;
          const j = opts[Math.floor(rng() * opts.length)]; land[j] = true; isle.push(j);
        }
        made++;
      }
    }
    const elev = new Array(n), moist = new Array(n);
    // distance from the sea, for keeping mountains and lakes inland
    const seaDist = new Array(n).fill(Infinity), q0 = [];
    for (let i = 0; i < n; i++) if (!land[i]) { seaDist[i] = 0; q0.push(i); }
    for (let k = 0; k < q0.length; k++) for (const j of nbrs(tmp, q0[k])) if (seaDist[j] === Infinity) { seaDist[j] = seaDist[q0[k]] + 1; q0.push(j); }
    if (!q0.length) for (let i = 0; i < n; i++) seaDist[i] = 99;
    for (let i = 0; i < n; i++) {
      const c = i % w, r = Math.floor(i / w);
      elev[i] = 0.6 * e2(c, r) + 0.2 * e3(c, r);
      moist[i] = 0.6 * m1(c, r) + 0.4 * m2(c, r);
    }
    const landIdx = [...Array(n).keys()].filter((i) => land[i]);
    // Mountain ranges: winding spines a tile or two wide, broken by passes,
    // instead of one big massif in the middle of each landmass.
    const mtn = new Set();
    const inland = (i) => i >= 0 && land[i] && seaDist[i] >= 2;
    const mtnTarget = Math.round(landIdx.length * 0.075);
    const inlandIdx = landIdx.filter(inland);
    for (let tries = 0; mtn.size < mtnTarget && tries < 600 && inlandIdx.length; tries++) {
      let cur = inlandIdx[Math.floor(rng() * inlandIdx.length)];
      if (within(tmp, cur, 2).some((j) => mtn.has(j))) continue; // start clear of other ranges
      let dir = Math.floor(rng() * 6), gap = 0;
      const len = Math.round((5 + rng() * 11) * (0.7 + 0.45 * Z));
      for (let step = 0; step < len && mtn.size < mtnTarget; step++) {
        if (gap > 0) gap--;
        else if (rng() < 0.13) gap = 1 + (rng() < 0.4 ? 1 : 0); // a pass
        else {
          mtn.add(cur);
          if (rng() < 0.3) { const side = dirs(tmp, cur)[(dir + (rng() < 0.5 ? 1 : 5)) % 6]; if (inland(side)) mtn.add(side); }
        }
        if (rng() < 0.3) dir = (dir + (rng() < 0.5 ? 1 : 5)) % 6;
        const next = dirs(tmp, cur)[dir];
        if (!inland(next)) { dir = (dir + 3 + (rng() < 0.5 ? 1 : -1) + 6) % 6; const alt = dirs(tmp, cur)[dir]; if (!inland(alt)) break; cur = alt; } else cur = next;
      }
    }
    for (let i = 0; i < n; i++) m.tiles.push({ type: !land[i] ? 'ocean' : mtn.has(i) ? 'mountain' : 'grassland', owner: null, rail: null, bridge: false, bridgeBy: null, trap: null });

    const isG = (i) => m.tiles[i].type === 'grassland';
    // land rises toward the mountains, so rivers run away from the ranges instead of along them
    {
      const md = new Array(n).fill(Infinity), q = [];
      for (let i = 0; i < n; i++) if (m.tiles[i].type === 'mountain') { md[i] = 0; q.push(i); }
      for (let k = 0; k < q.length; k++) for (const j of nbrs(m, q[k])) if (md[j] === Infinity) { md[j] = md[q[k]] + 1; q.push(j); }
      for (let i = 0; i < n; i++) elev[i] += 1.5 / (1 + Math.min(md[i], 20)) + 0.25 * Math.min(seaDist[i], 12) * (share >= 1 ? 0 : 1);
    }
    const wet = (i) => ['ocean', 'lake', 'river'].includes(m.tiles[i].type);

    // Lakes: a few big ones and many small ones; bigger on zoomed-in maps
    const lakeTarget = Math.round(N * (type === 'landlocked' ? 0.035 : 0.014));
    const maxLake = Math.round(3 + 10 * Z * Z);
    let lakeTiles = 0;
    for (let k = 0; k < 4000 && lakeTiles < lakeTarget; k++) {
      const i = Math.floor(rng() * n);
      if (!isG(i) || seaDist[i] < 3 || nbrs(m, i).some(wet)) continue;
      const size = 1 + Math.floor(Math.pow(rng(), 2.2) * maxLake);
      const lake = [i]; m.tiles[i].type = 'lake';
      for (let g = 1; g < size; g++) {
        const from = lake[Math.floor(rng() * lake.length)];
        const opts = nbrs(m, from).filter((j) => isG(j) && seaDist[j] >= 2 && !nbrs(m, j).some((q) => wet(q) && !lake.includes(q)));
        if (!opts.length) continue;
        const j = opts[Math.floor(rng() * opts.length)]; m.tiles[j].type = 'lake'; lake.push(j);
      }
      lakeTiles += lake.length;
    }
    // Rivers run from mountain foothills downhill toward water (or end in a lake).
    const springs = [];
    for (let i = 0; i < n; i++) if (isG(i) && nbrs(m, i).some((j) => m.tiles[j].type === 'mountain')) springs.push(i);
    shuffle(springs, rng);
    let rivers = 0;
    const wantRivers = Math.max(2, Math.round(N / (type === 'landlocked' ? 115 : 145)));
    for (const s of springs) {
      if (rivers >= wantRivers) break;
      if (nbrs(m, s).some(wet)) continue;
      const path = [s], seen = new Set([s]);
      let cur = s, reached = false;
      for (let k = 0; k < Math.round(14 + 22 * Z); k++) {
        const nb = nbrs(m, cur);
        if (k > 0 && nb.some((j) => wet(j) && !seen.has(j))) { reached = true; break; }
        const cand = nb.filter((j) => isG(j) && !seen.has(j) && !nbrs(m, j).some((x) => seen.has(x) && x !== cur)).sort((a, b) => elev[a] - elev[b]);
        if (!cand.length) break;
        cur = cand[0]; seen.add(cur); path.push(cur);
      }
      if (path.length < 4) continue;
      if (!reached) m.tiles[path[path.length - 1]].type = 'lake';
      for (const t of path) if (isG(t)) m.tiles[t].type = 'river';
      rivers++;
    }
    // Resources on open land
    for (let i = 0; i < n; i++) {
      if (!isG(i)) continue;
      const r = Math.floor(i / w), lat = Math.abs(r / (h - 1) - 0.5) * 2;
      const x = rng();
      if (moist[i] > 0.6 ? x < 0.7 : moist[i] > 0.48 ? x < 0.22 : x < 0.06) { m.tiles[i].type = 'forest'; continue; }
      const c = i % w, hill = nbrs(m, i).some((j) => m.tiles[j].type === 'mountain');
      const po = 0.065 * (0.15 + 3 * Math.pow(oreN(c, r), 2.5)) + (hill ? 0.06 : 0);
      const pc = 0.055 * (0.15 + 3 * Math.pow(coalN(c, r), 2.5)) + (hill ? 0.03 : 0);
      const y = rng();
      if (y < po) m.tiles[i].type = 'ore';
      else if (y < po + pc) m.tiles[i].type = 'coal';
    }

    // Starting positions: spread the nations as far apart as possible, only on
    // landmasses big enough to hold a city's territory.
    const landT = (i) => TT[m.tiles[i].type].terrain === 'land';
    const comp = new Array(n).fill(-1), compSize = [];
    for (let i = 0, id = 0; i < n; i++) {
      if (m.tiles[i].type === 'ocean' || comp[i] >= 0) continue;
      const q = [i]; comp[i] = id;
      for (let k = 0; k < q.length; k++) for (const j of nbrs(m, q[k])) if (m.tiles[j].type !== 'ocean' && comp[j] < 0) { comp[j] = id; q.push(j); }
      compSize.push(q.length); id++;
    }
    const okComp = (i) => compSize[comp[i]] >= Math.min(30, Math.round(tpp * 0.25));
    let cand = [];
    for (let i = 0; i < n; i++) {
      const [c, r] = colRow(m, i);
      if (c < 1 || r < 1 || c > w - 2 || r > h - 2 || !landT(i) || !okComp(i)) continue;
      if (within(m, i, 2).filter(landT).length >= 12) cand.push(i);
    }
    if (cand.length < nPlayers * 2) { cand = []; for (let i = 0; i < n; i++) if (landT(i) && okComp(i)) cand.push(i); }
    if (cand.length < nPlayers) { cand = []; for (let i = 0; i < n; i++) if (landT(i)) cand.push(i); }
    // On continents and old/new world maps, share the nations out between the
    // big landmasses in proportion to their size.
    let slots = null;
    const K = type === 'continents' ? 3 : type === 'oldNew' ? 2 : 0;
    if (K) {
      const majors = compSize.map((sz, id) => ({ id, sz })).filter((x) => cand.some((i) => comp[i] === x.id)).sort((a, b) => b.sz - a.sz).slice(0, K);
      const total = majors.reduce((a, x) => a + x.sz, 0);
      if (majors.length > 1 && total) {
        const q = majors.map((x) => ({ id: x.id, exact: (nPlayers * x.sz) / total }));
        for (const x of q) x.n = Math.floor(x.exact);
        let left = nPlayers - q.reduce((a, x) => a + x.n, 0);
        for (const x of q.slice().sort((a, b) => (b.exact - b.n) - (a.exact - a.n))) if (left > 0) { x.n++; left--; }
        slots = shuffle(q.flatMap((x) => Array(x.n).fill(x.id)), rng);
      }
    }
    let starts = null, bestMin = -1;
    for (let attempt = 0; attempt < 6; attempt++) {
      const pool = (k) => (slots ? cand.filter((i) => comp[i] === slots[k]) : cand);
      const p0 = pool(0);
      const st = [p0[Math.floor(rng() * p0.length)]];
      while (st.length < nPlayers) {
        let best = -1, bd = -1;
        for (const i of pool(st.length)) {
          if (st.includes(i)) continue;
          const d = Math.min(...st.map((s) => dist(m, s, i))) + rng() * 0.5;
          if (d > bd) { bd = d; best = i; }
        }
        if (best < 0) best = cand.find((i) => !st.includes(i));
        st.push(best);
      }
      let mn = Infinity;
      for (let a2 = 0; a2 < st.length; a2++) for (let b2 = a2 + 1; b2 < st.length; b2++) mn = Math.min(mn, dist(m, st[a2], st[b2]));
      if (mn > bestMin) { bestMin = mn; starts = st; }
    }
    starts = shuffle(starts, rng);
    // Every start gets the basics within its first two rings
    const reserved = new Set(starts);
    for (const s of starts) {
      m.tiles[s].type = 'grassland';
      const ring = within(m, s, 2).filter((j) => j !== s);
      const ring3 = within(m, s, 3).filter((j) => dist(m, s, j) === 3);
      for (const j of ring) if (m.tiles[j].type === 'mountain' && rng() < 0.6) m.tiles[j].type = 'grassland';
      const conv = (pool, type) => {
        const opts = pool.filter((j) => isG(j) && !reserved.has(j));
        if (!opts.length) return false;
        m.tiles[opts[Math.floor(rng() * opts.length)]].type = type;
        return true;
      };
      for (const [type, k] of [['forest', 2], ['ore', 1], ['coal', 1]]) {
        let have = ring.filter((j) => m.tiles[j].type === type).length;
        while (have < k && conv(ring, type)) have++;
      }
      let grass = ring.filter(isG).length;
      for (const j of ring) if (grass < 4 && ['mountain', 'oil', 'rubber'].includes(m.tiles[j].type)) { m.tiles[j].type = 'grassland'; grass++; }
      if (!within(m, s, 2).some(wet)) conv(ring.filter((j) => dist(m, s, j) === 2), 'lake');
      for (const j of ring) reserved.add(j);
    }
    // Rubber and oil: most tiles in one region far from every capital, the rest scattered.
    const regionCenters = [];
    const placeRegional = (type, spec) => {
      let total = 0;
      for (let p = 0; p < nPlayers; p++) total += spec.perPlayerMin + Math.floor(rng() * (spec.perPlayerMax - spec.perPlayerMin + 1));
      const inRegion = Math.round(total * spec.regionShare);
      // open land, preferring plain grassland; forest and veins are used only when land is scarce
      const soft = (j) => ['forest', 'ore', 'coal'].includes(m.tiles[j].type);
      const free = (j) => (isG(j) || soft(j)) && !reserved.has(j) && !starts.some((s) => dist(m, s, j) <= 2);
      const pen = (j) => (isG(j) ? 0 : 3);
      const opts = [];
      for (let i = 0; i < n; i++) if (free(i)) opts.push(i);
      if (!opts.length) return null;
      // the centre: the open tile farthest from every capital and from the other region
      const far = (i) => Math.min(...starts.map((s) => dist(m, s, i)), ...regionCenters.map((c) => dist(m, c, i) * 0.8)) + rng() * 1.5;
      let rad = Math.max(3, Math.round(Math.sqrt(inRegion / 0.33) * (0.8 + 0.3 * Z)));
      // the centre must have enough open land around it (not a lone islet)
      const optSet = new Set(opts);
      const roomy = (i) => within(m, i, rad).filter((j) => optSet.has(j)).length >= inRegion * 3;
      const ranked = opts.map((i) => [i, far(i)]).sort((a, b) => b[1] - a[1]);
      let center = ranked[0][0];
      for (const [i] of ranked.slice(0, 400)) if (roomy(i)) { center = i; break; }
      regionCenters.push(center);
      // Spread the regional tiles loosely over an area: about one open tile in eight,
      // never two side by side, so other land lies around and between them.
      const placed = new Set();
      const spaced = (j) => ![...placed].some((q) => dist(m, q, j) < 2);
      for (let grow = 0; placed.size < inRegion && grow < 12; grow++, rad++) {
        const area = shuffle(opts.filter((j) => !placed.has(j) && dist(m, center, j) <= rad && free(j)), rng).sort((a, b) => pen(a) - pen(b));
        for (const j of area) { if (placed.size >= inRegion) break; if (spaced(j) && rng() < 0.55) { m.tiles[j].type = type; placed.add(j); } }
      }
      const key = (j) => dist(m, center, j) + pen(j);
      // the rest sprinkled one by one well outside the region (grassland first); if the map is too small, closer in
      const left = opts.filter((j) => !placed.has(j) && free(j));
      const far2 = shuffle(left.filter((j) => dist(m, center, j) > rad + 2), rng).sort((a, b) => pen(a) - pen(b));
      const near = left.filter((j) => dist(m, center, j) <= rad + 2).sort((a, b) => key(a) - key(b));
      for (const j of [...far2, ...near]) { if (placed.size >= total) break; if (spaced(j)) { m.tiles[j].type = type; placed.add(j); } }
      for (const j of near) { if (placed.size >= total) break; if (!placed.has(j)) { m.tiles[j].type = type; placed.add(j); } }
      return center;
    };
    placeRegional('rubber', R.MAP.rubber);
    placeRegional('oil', R.MAP.oil);
    return { map: m, starts };
  }

  /* ---------------- lookups ---------------- */
  const cityById = (S, id) => S.cities.find((c) => c.id === id);
  const unitById = (S, id) => S.units.find((u) => u.id === id);
  const cityAt = (S, t) => S.cities.find((c) => c.t === t);
  const unitsAt = (S, t) => S.units.filter((u) => u.t === t && u.carriedBy == null);
  const cityBuildings = (S, cid) => S.buildings.filter((b) => b.city === cid);
  const countB = (S, cid, key) => S.buildings.reduce((n, b) => n + (b.city === cid && b.key === key ? 1 : 0), 0);
  const tileBuilding = (S, t) => S.buildings.find((b) => b.t === t && B[b.key].place === 'tile');
  const tileOwnerCity = (S, t) => { const o = S.map.tiles[t].owner; return o == null ? null : cityById(S, o); };
  const tileOwner = (S, t) => { const c = tileOwnerCity(S, t); return c ? c.owner : null; };
  const citiesOf = (S, pid) => S.cities.filter((c) => c.owner === pid);
  const unitsOf = (S, pid) => S.units.filter((u) => u.owner === pid);
  const unitName = (u) => `${U[u.type].name} #${u.id}`;
  const buildingOwner = (S, b) => { const c = cityById(S, b.city); return c ? c.owner : null; };
  const carried = (S, tr) => S.units.filter((u) => u.carriedBy === tr.id);
  function garrisonOf(S, city) { return unitsAt(S, city.t).find((u) => U[u.type].role === 'combat' && U[u.type].cls === 'land'); }
  function posOf(S, u) { if (u.carriedBy != null) { const tr = unitById(S, u.carriedBy); if (tr) return tr.t; } return u.t; }

  /* ---------------- relations ---------------- */
  const pairs = (x, a, b) => (x.a === a && x.b === b) || (x.a === b && x.b === a);
  const atWar = (S, a, b) => a !== b && a != null && b != null && S.wars.some((w) => pairs(w, a, b));
  const hasTreaty = (S, a, b, type) => S.treaties.some((t) => t.type === type && pairs(t, a, b));
  const friendly = (S, a, b) => a === b && a != null;

  /* ---------------- research ---------------- */
  function isUnlocked(S, pid, key) {
    const d = B[key];
    if (!d) return false;
    if (d.sci === 0) return true;
    const p = S.players[pid];
    return p.researched.includes(key) || p.blueprints.includes(key);
  }
  const unitUnlocked = (S, pid, type) => isUnlocked(S, pid, U[type].unlock);

  /* ---------------- city stats & storage ---------------- */
  const territoryRadius = (S, c) => R.CITY.territory + (countB(S, c.id, 'townHall') ? 1 : 0);
  const supplyRadius = (S, c) => R.CITY.supplyRadius + Math.min(R.CITY.maxDepots, countB(S, c.id, 'supplyDepot'));
  function maxHp(S, c) { let hp = R.CITY.baseHp; for (const b of cityBuildings(S, c.id)) hp += B[b.key].hp || 0; return hp; }
  function recipeOf(b) {
    const d = B[b.key];
    if (!d.recipes) return null;
    const keys = Object.keys(d.recipes);
    return d.recipes[d.recipes[b.product] ? b.product : keys[0]];
  }
  function recipeKey(b) { const d = B[b.key]; if (!d.recipes) return null; return d.recipes[b.product] ? b.product : Object.keys(d.recipes)[0]; }
  function buildingOutput(S, b) {
    const rc = recipeOf(b);
    if (!rc) return {};
    const out = Object.assign({}, rc.out || {});
    const d = B[b.key];
    if (b.t == null) return out;
    if (d.waterBonus && nbrs(S.map, b.t).some((j) => ['river', 'lake'].includes(S.map.tiles[j].type))) out.food = (out.food || 0) + d.waterBonus;
    if (d.oceanFood && S.map.tiles[b.t].type === 'ocean') out.food = d.oceanFood;
    if (d.riverFuel && nbrs(S.map, b.t).some((j) => S.map.tiles[j].type === 'river')) out.fuel = (out.fuel || 0) + d.riverFuel;
    return out;
  }
  function capacity(S, c, g) {
    let cap = R.CITY.baseStorage;
    for (const b of cityBuildings(S, c.id)) {
      const d = B[b.key];
      if (d.storage && d.storage[g]) cap += d.storage[g];
      if (d.storageAll && !R.SPECIAL_STORAGE.includes(g)) cap += d.storageAll;
      const out = buildingOutput(S, b);
      if (out[g]) cap += R.CITY.productionStorageTurns * out[g];
    }
    return cap;
  }
  const freeSpace = (S, c, g) => Math.max(0, capacity(S, c, g) - (c.stock[g] || 0));
  function addToCity(S, c, g, n) { const add = Math.max(0, Math.min(n, freeSpace(S, c, g))); if (add) c.stock[g] = (c.stock[g] || 0) + add; return add; }
  const cargoUsed = (u) => sum(u.cargo);
  const cargoFree = (u) => Math.max(0, (U[u.type].cargo || 0) - cargoUsed(u));
  function addToUnit(u, g, n) { const add = Math.max(0, Math.min(n, cargoFree(u))); if (add) u.cargo[g] = (u.cargo[g] || 0) + add; return add; }
  function hasGoods(stock, need) { for (const [g, v] of Object.entries(need)) if (g !== 'mp' && (stock[g] || 0) < v) return false; return true; }
  function takeGoods(stock, need) { for (const [g, v] of Object.entries(need)) if (g !== 'mp') stock[g] = (stock[g] || 0) - v; }
  const goodsOnly = (cost) => { const o = {}; for (const [g, v] of Object.entries(cost)) if (g !== 'mp') o[g] = v; return o; };

  /* ---------------- market ---------------- */
  function worldTotals(S) {
    const tot = {};
    for (const g of GOODS) tot[g] = S.market.pool[g] || 0;
    for (const c of S.cities) for (const g of GOODS) tot[g] += c.stock[g] || 0;
    for (const u of S.units) for (const g of GOODS) tot[g] += u.cargo[g] || 0;
    return tot;
  }
  function computePrices(S) {
    const tot = worldTotals(S), P = {};
    for (const g of GOODS) {
      const pool = S.market.pool[g] || 0;
      const r = tot[g] > 0 ? pool / tot[g] : 0;
      const sell = Math.max(1, Math.round(R.BASE_PRICE[g] / (1 + R.MARKET.scale * r)));
      P[g] = { sell, pays: Math.max(1, Math.round(sell * R.MARKET.buyRatio)), r, pool, world: tot[g] };
    }
    S.market.prices = P;
    return P;
  }

  /* ---------------- movement ---------------- */
  function portOk(S, city, u) {
    const port = countB(S, city.id, 'port') > 0, harbor = countB(S, city.id, 'harbor') > 0;
    return port || (U[u.type].power === 'sail' && harbor);
  }
  function dockable(S, city, u) {
    if (U[u.type].cls !== 'ship' || !portOk(S, city, u)) return false;
    return friendly(S, city.owner, u.owner) || hasTreaty(S, city.owner, u.owner, 'port');
  }
  function captureOk(S, u, city) {
    return U[u.type].capture && atWar(S, city.owner, u.owner) && city.hp <= 0 && !garrisonOf(S, city);
  }
  // Can unit u enter tile `to`? opt.final = it ends there, opt.partner = trade partner whose land/ports it may use.
  function canEnter(S, u, to, opt = {}) {
    const tile = S.map.tiles[to], d = U[u.type], ter = TT[tile.type].terrain;
    if (ter === 'mountain') return false;
    const city = cityAt(S, to), partner = opt.partner, owner = tileOwner(S, to);
    let capturing = false;
    if (d.cls === 'ship') {
      if (ter !== 'water') {
        if (!city) return false;
        const allowed = dockable(S, city, u) || (partner != null && city.owner === partner && portOk(S, city, u));
        if (!allowed) return false;
      } else if (tile.type !== 'ocean' && owner != null && !friendly(S, owner, u.owner) && owner !== partner && !atWar(S, owner, u.owner) && !hasTreaty(S, owner, u.owner, 'transit')) {
        return false; // claimed ocean is open to every ship; claimed rivers and lakes are not
      }
    } else {
      if (ter === 'water' && !tile.bridge) return false;
      if (d.cls === 'rail') {
        const railOwner = city ? city.owner : tile.rail;
        if (railOwner == null) return false;
        if (!friendly(S, railOwner, u.owner) && railOwner !== partner && !hasTreaty(S, railOwner, u.owner, 'rail')) return false;
      }
      if (u.type === 'tank' && tile.trap != null) { const tc = cityById(S, tile.trap); if (!tc || !friendly(S, tc.owner, u.owner)) return false; }
      if (owner != null && !friendly(S, owner, u.owner) && owner !== partner && !atWar(S, owner, u.owner) && !hasTreaty(S, owner, u.owner, 'transit')) return false;
      if (city && !friendly(S, city.owner, u.owner) && city.owner !== partner) {
        if (!(opt.final && captureOk(S, u, city))) return false;
        capturing = true;
      }
    }
    if (!opt.ignoreUnits) {
      const hostile = unitsAt(S, to).filter((x) => !friendly(S, x.owner, u.owner) && x.owner !== partner);
      if (hostile.length && !(capturing && hostile.every((x) => U[x.type].role !== 'combat'))) return false;
    }
    return true;
  }
  function findPath(S, u, from, to, opt = {}) {
    if (from === to) return [from];
    const m = S.map, prev = new Map([[from, -1]]);
    let frontier = [from];
    const max = opt.max == null ? Infinity : opt.max;
    for (let d = 0; frontier.length && d < max; d++) {
      const next = [];
      for (const t of frontier) for (const j of nbrs(m, t)) {
        if (prev.has(j)) continue;
        const final = j === to;
        if (!canEnter(S, u, j, Object.assign({}, opt, { final }))) continue;
        prev.set(j, t);
        if (final) { const path = [j]; let k = t; while (k !== -1) { path.push(k); k = prev.get(k); } return path.reverse(); }
        // never path *through* a foreign city
        const c = cityAt(S, j);
        if (c && !friendly(S, c.owner, u.owner) && U[u.type].cls !== 'ship' && c.owner !== opt.partner) continue;
        next.push(j);
      }
      frontier = next;
    }
    return null;
  }
  // Tiles a unit can reach this turn -> Map(tile -> path)
  function reachable(S, u) {
    const m = S.map, mv = U[u.type].move, prev = new Map([[u.t, -1]]);
    let frontier = [u.t];
    for (let d = 0; d < mv; d++) {
      const next = [];
      for (const t of frontier) for (const j of nbrs(m, t)) {
        if (prev.has(j)) continue;
        if (!canEnter(S, u, j, { final: true })) continue;
        prev.set(j, t);
        const c = cityAt(S, j);
        if (c && !friendly(S, c.owner, u.owner)) continue; // capture tile: may end there, not pass through
        next.push(j);
      }
      frontier = next;
    }
    const res = new Map();
    for (const [t] of prev) {
      if (t === u.t) continue;
      const path = []; let k = t;
      while (k !== -1) { path.push(k); k = prev.get(k); }
      res.set(t, path.reverse());
    }
    return res;
  }

  /* ---------------- stacking & carrying ----------------
     Each tile holds one combat unit and up to STACK.logistics logistics units,
     counted separately for ships and land units. City tiles hold any number of
     logistics units (and docked ships). Units aboard a transport don't count. */
  const unitGroup = (u) => (U[u.type].cls === 'ship' ? 'ship' : 'land');
  function slotFree(S, u, t) {
    const city = cityAt(S, t), d = U[u.type];
    const here = unitsAt(S, t).filter((x) => x !== u && unitGroup(x) === unitGroup(u));
    if (d.role === 'combat') {
      if (d.cls === 'ship' && city && portOk(S, city, u)) return true;
      return !here.some((x) => U[x.type].role === 'combat' && !(d.cls === 'ship' && city && portOk(S, city, x)));
    }
    if (city) return true;
    return here.filter((x) => U[x.type].role !== 'combat').length < R.STACK.logistics;
  }
  const carrySlots = (tr, u) => { const ct = U[tr.type].carryTypes; return ct ? ct[u.type] : 1; };
  function canCarry(S, tr, u) {
    const td = U[tr.type];
    if (!td.carry || tr.carriedBy != null) return 'it cannot carry units';
    if (U[u.type].cls !== 'land' && U[u.type].cls !== 'rail') return 'only land units can board';
    if (u.type === 'train' || (U[u.type].cls === 'rail')) return 'trains cannot be carried';
    if (td.carryTypes && !td.carryTypes[u.type]) return `it only carries ${Object.keys(td.carryTypes).map((k) => U[k].name.toLowerCase()).join(' or ')}`;
    if (U[u.type].carry && carried(S, u).length) return 'a loaded transport cannot board';
    const used = carried(S, tr).reduce((a, x) => a + carrySlots(tr, x), 0);
    if (used + carrySlots(tr, u) > td.carry) return 'it is full';
    return null;
  }

  /* ---------------- combat helpers ---------------- */
  function pickTarget(S, attKey, attOwner, t) {
    const city = cityAt(S, t);
    if (city && !friendly(S, city.owner, attOwner)) {
      if (city.hp > 0) {
        if (!atWar(S, attOwner, city.owner)) return null;
        return R.dmg(attKey, 'city') > 0 ? { city } : null; // garrison and docked ships are protected while the city stands
      }
    }
    const foes = unitsAt(S, t).filter((x) => atWar(S, attOwner, x.owner));
    const combat = foes.filter((x) => U[x.type].role === 'combat' && R.dmg(attKey, x.type) > 0);
    if (combat.length) return { unit: combat[0] };
    const others = foes.filter((x) => R.dmg(attKey, x.type) > 0);
    if (others.length) return { unit: others[0] };
    return null;
  }
  function attackTargets(S, u) {
    const d = U[u.type];
    if (d.role !== 'combat' || u.carriedBy != null) return [];
    return within(S.map, u.t, d.range).filter((t) => t !== u.t && pickTarget(S, u.type, u.owner, t));
  }
  function cityWeaponTargets(S, c, w) {
    if (!countB(S, c.id, w)) return [];
    return within(S.map, c.t, R.WEAPON_RANGE).filter((t) => { const p = pickTarget(S, w, c.owner, t); return p && p.unit; });
  }

  /* ---------------- supply ---------------- */
  function supplySources(S, u) {
    const d = U[u.type], res = [], pos = posOf(S, u);
    if (d.cargo) res.push({ kind: 'unit', ref: u });
    if (u.carriedBy != null) { const tr = unitById(S, u.carriedBy); if (tr) res.push({ kind: 'unit', ref: tr }); }
    const cities = citiesOf(S, u.owner).map((c) => ({ c, dd: dist(S.map, c.t, pos) })).sort((a, b) => a.dd - b.dd);
    for (const { c, dd } of cities) {
      if (d.cls === 'ship') { if (portOk(S, c, u) && dd <= R.CITY.portRadius) res.push({ kind: 'city', ref: c }); }
      else if (dd <= supplyRadius(S, c)) res.push({ kind: 'city', ref: c });
    }
    if (d.cls !== 'ship') {
      for (const x of S.units) {
        if (x === u || x.owner !== u.owner || x.carriedBy != null || x.id === u.carriedBy) continue;
        const mobile = x.type === 'caravan' || x.type === 'supplyTruck' || (x.type === 'train' && x.route == null);
        if (mobile && dist(S.map, x.t, pos) <= R.CITY.unitSupplyRadius) res.push({ kind: 'unit', ref: x });
      }
    }
    return res;
  }
  const stockRef = (src) => (src.kind === 'city' ? src.ref.stock : src.ref.cargo);
  const sourceName = (src) => (src.kind === 'city' ? src.ref.name : unitName(src.ref));
  function drawGoods(sources, need, commit) {
    const missing = {}, plan = [];
    for (const [g, amt] of Object.entries(need)) {
      if (amt <= 0) continue;
      let left = amt;
      for (const s of sources) {
        if (left <= 0) break;
        const st = stockRef(s), take = Math.min(left, st[g] || 0);
        if (take > 0) { plan.push([st, g, take, s]); left -= take; }
      }
      if (left > 0) missing[g] = left;
    }
    const ok = Object.keys(missing).length === 0;
    if (commit && ok) for (const [st, g, take] of plan) st[g] -= take;
    return { ok, missing, used: [...new Set(plan.map((p) => p[3]))] };
  }
  function inBase(S, u) {
    const d = U[u.type], c = cityAt(S, posOf(S, u));
    if (!c || c.owner !== u.owner || u.carriedBy != null) return false;
    if (d.cls === 'ship') return portOk(S, c, u);
    return countB(S, c.id, 'barracks') > 0;
  }
  function upkeepOf(S, u, moved) {
    if (inBase(S, u)) return {};
    const d = U[u.type], need = Object.assign({}, d.idle);
    for (const [g, x] of Object.entries(d.perTile)) { const v = Math.floor(x * (moved || 0)); if (v) need[g] = (need[g] || 0) + v; }
    return need;
  }

  /* ---------------- validation shared by UI and engine ---------------- */
  function checkBuild(S, pid, o) {
    const c = cityById(S, o.city), d = B[o.key];
    if (!d) return 'Unknown building';
    if (!c || c.owner !== pid) return 'Not your city';
    if (!isUnlocked(S, pid, o.key)) return 'Not researched yet';
    if (d.place === 'city') {
      if (d.limit && countB(S, c.id, o.key) >= d.limit) return `Only ${d.limit} per city`;
      if (d.needsWater && !nearWater(S, c.t)) return 'City must be next to water';
      return null;
    }
    const t = o.t;
    if (t == null || t < 0 || t >= S.map.tiles.length) return 'Pick a tile';
    const tile = S.map.tiles[t];
    if (d.place === 'tile') {
      if (tile.owner !== c.id) return "Tile must be in this city's territory";
      if (cityAt(S, t)) return 'Not on the city tile';
      if (o.key === 'tankTrap') {
        if (!isLand(S, t)) return 'Land tiles only';
        if (tile.trap != null) return 'Tile already has a tank trap';
        if (S.map.tiles.some((x) => x.trap === c.id)) return 'Only 1 tank trap per city';
        return null;
      }
      if (tileBuilding(S, t)) return 'Tile already has a building';
      if (!d.tiles.includes(tile.type)) return `Needs ${d.tiles.map((x) => TT[x].name.toLowerCase()).join(' or ')}`;
      if (o.key === 'fishery' && tile.bridge) return 'Not on a bridged tile';
      return null;
    }
    // infrastructure
    const own = tileOwner(S, t);
    if (own != null && !friendly(S, own, pid)) return "Inside another nation's territory";
    if (o.key === 'railroad') {
      if (tile.rail != null) return 'Already has a railroad';
      if (terrain(S, t) === 'mountain') return 'Mountains are impassable';
      if (isWater(S, t)) return 'Use a rail bridge to cross water';
      if (cityAt(S, t)) return 'Cities already act as rail stations';
      return null;
    }
    if (o.key === 'bridge' || o.key === 'railBridge') {
      if (tile.type !== 'river' && tile.type !== 'lake') return 'Bridges go on rivers and lakes, never the ocean';
      if (o.key === 'bridge' && tile.bridge) return 'Already bridged';
      if (o.key === 'railBridge' && tile.bridge === 'rail') return 'Already has a rail bridge';
      if (tileBuilding(S, t)) return 'Not on a tile with a fishery';
      return null;
    }
    return 'Cannot build here';
  }
  function checkTrain(S, pid, cityId, type) {
    const c = cityById(S, cityId), d = U[type];
    if (!d) return 'Unknown unit';
    if (!c || c.owner !== pid) return 'Not your city';
    if (!unitUnlocked(S, pid, type)) return `Research ${B[d.unlock].name} first`;
    if (!d.builtAt.some((k) => countB(S, c.id, k))) return `Needs a ${d.builtAt.map((k) => B[k].name.toLowerCase()).join(' or ')}`;
    return null;
  }
  function checkFound(S, pid, unitId) {
    const u = unitById(S, unitId);
    if (!u || u.owner !== pid) return 'Not your unit';
    if (U[u.type].role !== 'logistic' || u.carriedBy != null) return 'Use a logistics unit carrying the goods';
    if (!isLand(S, u.t)) return 'Cities go on land';
    if (cityAt(S, u.t)) return 'There is already a city here';
    if (S.map.tiles[u.t].owner != null) return "Can't found a city inside another city's territory";
    const fc = R.CITY.foundCost;
    if (!hasGoods(u.cargo, fc)) return `Unit must carry ${goodsText(fc)}`;
    if (S.players[pid].manpower < R.CITY.foundMp) return `Needs ${R.CITY.foundMp} manpower`;
    return null;
  }
  // Demolish orders: { t, what: 'building' | 'trap' | 'rail' | 'bridge' }
  function demolishable(S, pid, t) {
    const tile = S.map.tiles[t], own = tileOwnerCity(S, t), list = [];
    if (cityAt(S, t)) return list;
    const mine = own ? own.owner === pid : null; // null = unclaimed
    if (mine === false) return list;
    if (mine && tileBuilding(S, t)) list.push('building');
    if (mine && tile.trap != null) list.push('trap');
    if (tile.rail != null && tile.bridge !== 'rail' && (mine || tile.rail === pid)) list.push('rail');
    if (tile.bridge && (mine || tile.bridgeBy === pid)) list.push('bridge');
    return list;
  }
  function checkDemolish(S, pid, o) {
    const t = Number(o.t);
    if (!(t >= 0 && t < S.map.tiles.length)) return 'No such tile';
    if (!demolishable(S, pid, t).includes(o.what)) return 'Nothing of yours to demolish there';
    const tile = S.map.tiles[t], here = S.units.filter((u) => u.t === t);
    if (o.what === 'bridge' && here.some((u) => U[u.type].cls !== 'ship')) return 'Units are standing on the bridge';
    if ((o.what === 'rail' || (o.what === 'bridge' && tile.bridge === 'rail')) && here.some((u) => U[u.type].cls === 'rail')) return 'A train is on the track';
    return null;
  }
  // Clear-forest orders: { t } — a forest tile in one of your cities' territory becomes grassland.
  function checkClear(S, pid, o) {
    const t = Number(o.t);
    if (!(t >= 0 && t < S.map.tiles.length)) return 'No such tile';
    if (S.map.tiles[t].type !== 'forest') return 'Not a forest';
    const own = tileOwnerCity(S, t);
    if (!own || own.owner !== pid) return 'Only forests inside your own cities\' territory can be cleared';
    if (tileBuilding(S, t)) return `Demolish the ${B[tileBuilding(S, t).key].name.toLowerCase()} first`;
    if ((own.stock.tools || 0) < R.CLEAR_FOREST.tools) return `${own.name} needs ${R.CLEAR_FOREST.tools} tools`;
    if (S.players[pid].manpower < R.CLEAR_FOREST.mp) return `Needs ${R.CLEAR_FOREST.mp} manpower`;
    return null;
  }
  const PEACE_PART = () => ({ credits: 0, science: 0, cities: [], tiles: [] });
  function normPeace(pl) {
    const out = { term: Math.round(Number(pl && pl.term) || R.PEACE.minTerm), give: PEACE_PART(), get: PEACE_PART() };
    for (const side of ['give', 'get']) {
      const x = (pl && pl[side]) || {};
      out[side].credits = Math.max(0, Math.floor(Number(x.credits) || 0));
      out[side].science = Math.max(0, Math.floor(Number(x.science) || 0));
      out[side].cities = [...new Set((x.cities || []).map(Number))];
      out[side].tiles = [...new Set((x.tiles || []).map(Number))];
    }
    return out;
  }
  // a = proposer (gives `give`), b = receiver (gives `get`)
  function checkPeace(S, a, b, pl) {
    if (pl.term < R.PEACE.minTerm || pl.term > R.PEACE.maxTerm) return `the term must be ${R.PEACE.minTerm} to ${R.PEACE.maxTerm} turns`;
    for (const [pid, part] of [[a, pl.give], [b, pl.get]]) {
      const P = S.players[pid];
      if (P.eliminated) return `${P.name} is out of the game`;
      if (part.credits > P.credits) return `${P.name} does not have ${part.credits} credits`;
      if (part.science > P.science) return `${P.name} does not have ${part.science} science`;
      const mine = citiesOf(S, pid);
      for (const id of part.cities) if (!mine.some((c) => c.id === id)) return `${P.name} no longer owns one of the cities in the treaty`;
      if (part.cities.length && part.cities.length >= mine.length) return `${P.name} must keep at least one city`;
      for (const t of part.tiles) {
        const oc = t >= 0 && t < S.map.tiles.length ? tileOwnerCity(S, t) : null;
        if (!oc || oc.owner !== pid) return `${P.name} no longer holds tile ${t >= 0 && t < S.map.tiles.length ? tileLabel(S, t) : t}`;
        if (oc.t === t) return 'a city tile can only change hands with its city';
        if (part.cities.includes(oc.id)) return `tile ${tileLabel(S, t)} already goes with its city`;
      }
    }
    return null;
  }
  function peaceTerms(S, pr) {
    const pl = normPeace(pr.payload), out = [];
    for (const [pid, part] of [[pr.from, pl.give], [pr.to, pl.get]]) {
      const bits = [];
      if (part.credits) bits.push(`${part.credits} credits`);
      if (part.science) bits.push(`${part.science} science`);
      for (const id of part.cities) { const c = cityById(S, id); bits.push(c ? c.name : `city #${id}`); }
      if (part.tiles.length) bits.push(`${part.tiles.length} tile${part.tiles.length === 1 ? '' : 's'}`);
      if (bits.length) out.push(`${S.players[pid].name} gives ${bits.join(', ')}`);
    }
    return out.join('; ');
  }
  function routeEstimate(S, r) {
    const from = cityById(S, r.from);
    const to = r.to.type === 'city' ? cityById(S, r.to.id) : unitById(S, r.to.id);
    if (!from || !to) return { perTurn: 0, len: null, ok: false };
    const toT = to.t;
    let perTurn = 0, len = null, ok = r.transports.length > 0;
    for (const id of r.transports) {
      const u = unitById(S, id);
      if (!u) continue;
      const p = findPath(S, u, from.t, toT, { partner: r.partner, ignoreUnits: true });
      if (!p) { ok = false; continue; }
      len = p.length - 1;
      const rt = Math.max(1, Math.ceil((2 * len) / U[u.type].move));
      perTurn += (U[u.type].cargo || 0) / rt;
    }
    return { perTurn: perTurn >= 10 ? Math.floor(perTurn) : Math.round(perTurn * 10) / 10, len, ok };
  }
  function describeProposal(S, pr) {
    const p = pr.payload || {};
    if (pr.kind === 'peace') { const terms = peaceTerms(S, pr); return `a ${normPeace(p).term}-turn peace treaty${terms ? ` (${terms})` : ''}`; }
    if (pr.kind === 'treaty') return `a ${p.type} rights treaty`;
    if (pr.kind === 'blueprint') return `the ${B[p.key] ? B[p.key].name : p.key} blueprint for ${p.price} credits`;
    if (pr.kind === 'route') return `a trade route (#${p.route})`;
    return pr.kind;
  }

  /* ---------------- new game ---------------- */
  function claim(S, c) {
    for (const j of within(S.map, c.t, territoryRadius(S, c))) if (S.map.tiles[j].owner == null) S.map.tiles[j].owner = c.id;
    S.map.tiles[c.t].owner = c.id;
  }
  function foundCityAt(S, pid, t, name) {
    const c = { id: S.nextId++, name, owner: pid, t, hp: R.CITY.baseHp, stock: {}, attacked: false, founded: S.turn };
    S.cities.push(c);
    claim(S, c);
    return c;
  }
  // Starting resources: the host may change any of the listed amounts.
  function startingResources(custom) {
    const out = { stock: clone(R.START.stock), credits: R.START.credits, manpower: R.START.manpower };
    if (!custom) return out;
    const num = (v, d) => (Number.isFinite(+v) && v !== '' && v != null ? Math.max(0, Math.floor(+v)) : d);
    for (const g of Object.keys(out.stock)) out.stock[g] = num(custom.stock && custom.stock[g], out.stock[g]);
    out.credits = num(custom.credits, out.credits);
    out.manpower = num(custom.manpower, out.manpower);
    return out;
  }
  function newGame(opts) {
    const list = opts.players || [];
    if (list.length < 2 || list.length > 10) throw new Error('The game needs between 2 and 10 players.');
    const seed = opts.seed != null && opts.seed !== '' ? hashSeed(opts.seed) : (Math.floor(Math.random() * 4294967296) >>> 0);
    const rng = makeRng(seed);
    const { map, starts } = genMap(list.length, rng, { mapType: opts.mapType, tilesPerPlayer: opts.tilesPerPlayer });
    const start = startingResources(opts.start);
    const S = {
      version: 2, id: opts.id || `game-${seed.toString(36)}-${Date.now().toString(36)}`, name: opts.name || 'Guns, Pacts, and Commerce', start,
      seed, turn: 1, map, players: [], cities: [], units: [], buildings: [], routes: [], treaties: [], wars: [], proposals: [],
      market: { pool: {}, prices: {} }, reports: {}, nextId: 1, gameOver: null, history: [],
    };
    list.forEach((pl, i) => {
      S.players.push({
        id: i, name: pl.name || `Player ${i + 1}`, color: pl.color || R.PLAYER_COLORS[i % R.PLAYER_COLORS.length],
        credits: start.credits, manpower: start.manpower, science: 0, researched: [], blueprints: [],
        eliminated: false, priority: R.DEFAULT_PRIORITY.slice(), endVote: false,
      });
      const c = foundCityAt(S, i, starts[i], pl.cityName || `${pl.name || 'Player ' + (i + 1)} Capital`);
      for (const g of Object.keys(start.stock)) c.stock[g] = Math.min(start.stock[g], capacity(S, c, g));
      S.reports[i] = [{ turn: 0, cat: 'game', msg: `${c.name} founded. Build extraction, a forge and a workshop to get your economy running.` }];
    });
    computePrices(S);
    return S;
  }

  /* =====================================================================
     TURN RESOLUTION
     Phase order: diplomacy -> combat -> movement -> market buys -> market sells
     -> research -> production -> buildings -> units -> logistics (routes,
     supply & upkeep, repairs) -> end of turn
     ===================================================================== */
  const ORDER_LISTS = ['attacks', 'moves', 'board', 'unload', 'buys', 'sells', 'research', 'demolish', 'clear', 'builds', 'trains', 'found', 'cargo', 'routeOps', 'diplo'];

  // Bring a saved game from an older version up to date.
  function migrate(S) {
    if (!S || !S.players) return S;
    for (const p of S.players) {
      if (p.eliminated == null) p.eliminated = !!p.annexed;
      for (const k of ['annexed', 'vassalOf', 'approvals', 'lastTributeTurn', 'tributeDemand', 'refusedTribute', 'libPending']) delete p[k];
    }
    for (const t of S.map.tiles) { if (t.bridgeBy === undefined) t.bridgeBy = null; }
    S.proposals = (S.proposals || []).filter((pr) => ['peace', 'treaty', 'blueprint', 'route'].includes(pr.kind));
    S.version = 2;
    return S;
  }
  function normalizeOrders(o) {
    const out = { settings: (o && o.settings) || null };
    for (const k of ORDER_LISTS) out[k] = o && Array.isArray(o[k]) ? o[k] : [];
    return out;
  }
  const PRIO = { high: 0, normal: 1, low: 2 };

  function resolveTurn(S0, ordersByPlayer) {
    const S = clone(S0);
    if (S.gameOver) return S;
    const turn = S.turn;
    const rep = (pid, cat, msg) => { if (pid == null) return; (S.reports[pid] = S.reports[pid] || []).push({ turn, cat, msg }); };
    const both = (a, b, cat, msg) => { rep(a, cat, msg); if (b !== a) rep(b, cat, msg); };
    const active = S.players.filter((p) => !p.eliminated);
    const O = {};
    for (const p of active) O[p.id] = normalizeOrders((ordersByPlayer || {})[p.id]);
    for (const u of S.units) u.moved = 0;
    for (const c of S.cities) c.attacked = false;
    const prices = computePrices(S); // fixed for the whole turn
    const pname = (id) => S.players[id].name;

    function destroyUnit(u, why) {
      for (const x of carried(S, u)) destroyUnit(x, `lost aboard ${unitName(u)}`);
      S.units = S.units.filter((x) => x !== u);
      for (const r of S.routes) r.transports = r.transports.filter((id) => id !== u.id);
      rep(u.owner, 'combat', `${unitName(u)} was destroyed (${why}).`);
    }
    function removeRoute(id, why) {
      const r = S.routes.find((x) => x.id === id);
      if (!r) return;
      for (const tid of r.transports) { const u = unitById(S, tid); if (u) { u.route = null; u.leg = null; } }
      S.routes = S.routes.filter((x) => x.id !== id);
      if (why) { rep(r.owner, 'logistics', `Route #${id} closed: ${why}.`); if (r.partner != null) rep(r.partner, 'logistics', `Trade route #${id} closed: ${why}.`); }
    }
    function nearestCity(pid, t) {
      return citiesOf(S, pid).sort((a, b) => dist(S.map, a.t, t) - dist(S.map, b.t, t))[0];
    }
    function eliminate(loser, byPid) {
      const winner = S.players[byPid];
      winner.credits += loser.credits; winner.manpower += loser.manpower; winner.science += loser.science;
      const took = `${loser.credits} credits, ${loser.manpower} manpower and ${loser.science} science`;
      loser.credits = 0; loser.manpower = 0; loser.science = 0; loser.eliminated = true; loser.endVote = false;
      for (const u of unitsOf(S, loser.id)) S.units = S.units.filter((x) => x !== u);
      for (const r of S.routes.filter((x) => x.owner === loser.id || x.partner === loser.id)) removeRoute(r.id, `${loser.name} was eliminated`);
      S.treaties = S.treaties.filter((t) => t.a !== loser.id && t.b !== loser.id);
      S.wars = S.wars.filter((w) => w.a !== loser.id && w.b !== loser.id);
      S.proposals = S.proposals.filter((pr) => pr.from !== loser.id && pr.to !== loser.id);
      for (const tile of S.map.tiles) { if (tile.rail === loser.id) tile.rail = byPid; if (tile.bridgeBy === loser.id) tile.bridgeBy = byPid; }
      for (const q of S.players) rep(q.id, 'diplomacy', `${loser.name} lost its last city to ${winner.name} and is out of the game. ${winner.name} took its ${took}.`);
    }
    // move a unit off a tile it may no longer hold (e.g. a city that was ceded)
    function evacuate(u) {
      for (let rad = 1; rad <= 6; rad++) {
        const ring = within(S.map, u.t, rad).filter((t) => dist(S.map, u.t, t) === rad);
        const spot = ring.find((t) => {
          if (cityAt(S, t)) return false;
          const tile = S.map.tiles[t], ter = TT[tile.type].terrain;
          if (U[u.type].cls === 'ship' ? ter !== 'water' : (ter === 'mountain' || (ter === 'water' && !tile.bridge))) return false;
          if (U[u.type].cls === 'rail' && tile.rail !== u.owner) return false;
          const own = tileOwner(S, t);
          if (U[u.type].cls !== 'ship' && own != null && own !== u.owner) return false;
          if (unitsAt(S, t).some((x) => x.owner !== u.owner)) return false;
          return slotFree(S, u, t);
        });
        if (spot != null) { u.t = spot; for (const x of carried(S, u)) x.t = spot; return true; }
      }
      destroyUnit(u, 'it had nowhere to go after its city changed hands');
      return false;
    }
    function transferCity(c, to) {
      const old = c.owner;
      c.owner = to;
      for (const tile of S.map.tiles) if (tile.owner === c.id) { if (tile.rail === old) tile.rail = to; if (tile.bridgeBy === old) tile.bridgeBy = to; }
      for (const r of S.routes.slice()) if (r.from === c.id || (r.to.type === 'city' && r.to.id === c.id)) removeRoute(r.id, `${c.name} changed hands`);
      for (const u of unitsAt(S, c.t)) if (u.owner === old) evacuate(u);
    }
    function transferTile(t, to) {
      const tile = S.map.tiles[t], oldCity = tileOwnerCity(S, t);
      if (!oldCity) return;
      const old = oldCity.owner, dest = nearestCity(to, t);
      if (!dest) return;
      tile.owner = dest.id;
      for (const b of S.buildings) if (b.t === t && B[b.key].place === 'tile') b.city = dest.id;
      if (tile.trap === oldCity.id) tile.trap = dest.id;
      if (tile.rail === old) tile.rail = to;
      if (tile.bridgeBy === old) tile.bridgeBy = to;
    }
    function applyPeace(pr) {
      const a = S.players[pr.from], b = S.players[pr.to], pl = normPeace(pr.payload);
      const err = checkPeace(S, a.id, b.id, pl);
      if (err) { both(a.id, b.id, 'diplomacy', `The peace treaty between ${a.name} and ${b.name} could not be signed: ${err}.`); return; }
      const wasWar = atWar(S, a.id, b.id);
      S.wars = S.wars.filter((w) => !pairs(w, a.id, b.id));
      S.treaties = S.treaties.filter((t) => !(t.type === 'peace' && pairs(t, a.id, b.id)));
      S.treaties.push({ id: S.nextId++, a: a.id, b: b.id, type: 'peace', since: turn, endsTurn: turn + pl.term + 1 });
      for (const [giver, recv, part] of [[a, b, pl.give], [b, a, pl.get]]) {
        giver.credits -= part.credits; recv.credits += part.credits;
        giver.science -= part.science; recv.science += part.science;
        for (const id of part.cities) { const c = cityById(S, id); transferCity(c, recv.id); }
        for (const t of part.tiles) transferTile(t, recv.id);
      }
      both(a.id, b.id, 'diplomacy', `${a.name} and ${b.name} signed ${describeProposal(S, pr)}${wasWar ? ', ending their war' : ''}. Neither may declare war on the other before turn ${turn + pl.term + 1}.`);
    }

    /* ----- 0. settings & diplomacy ----- */
    for (const p of active) {
      const st = O[p.id].settings;
      if (!st) continue;
      if (Array.isArray(st.priority)) {
        const valid = st.priority.filter((k) => B[k] && B[k].recipes);
        p.priority = [...new Set([...valid, ...R.DEFAULT_PRIORITY])];
      }
      if (st.products) for (const [bid, prod] of Object.entries(st.products)) {
        const b = S.buildings.find((x) => x.id === Number(bid));
        if (b && buildingOwner(S, b) === p.id && B[b.key].recipes && B[b.key].recipes[prod]) b.product = prod;
      }
      if (st.halt) for (const [bid, on] of Object.entries(st.halt)) {
        const b = S.buildings.find((x) => x.id === Number(bid));
        if (b && buildingOwner(S, b) === p.id && B[b.key].recipes) b.halted = !!on;
      }
    }
    S.treaties = S.treaties.filter((t) => t.endsTurn == null || t.endsTurn > turn);
    for (const r of S.routes.slice()) if (r.endsTurn != null && r.endsTurn <= turn) removeRoute(r.id, 'cancellation took effect');

    // answers to proposals delivered this turn
    for (const p of active) for (const o of O[p.id].diplo) {
      if (o.type !== 'respond') continue;
      const pr = S.proposals.find((x) => x.id === o.id && x.to === p.id && x.turn === turn);
      if (!pr || pr.answered) continue;
      pr.answered = true;
      const from = S.players[pr.from];
      if (from.eliminated) continue;
      if (!o.accept) {
        both(pr.from, p.id, 'diplomacy', `${p.name} rejected ${describeProposal(S, pr)} from ${from.name}.`);
        if (pr.kind === 'route') removeRoute(pr.payload.route, `${p.name} declined it`);
        continue;
      }
      const pl = pr.payload || {};
      if (pr.kind === 'peace') {
        applyPeace(pr);
      } else if (pr.kind === 'treaty') {
        if (atWar(S, pr.from, p.id) || hasTreaty(S, pr.from, p.id, pl.type)) continue;
        S.treaties.push({ id: S.nextId++, a: pr.from, b: p.id, type: pl.type, since: turn, endsTurn: null });
        both(pr.from, p.id, 'diplomacy', `${from.name} and ${p.name} agreed ${pl.type} rights.`);
      } else if (pr.kind === 'blueprint') {
        if (!from.researched.includes(pl.key)) { rep(p.id, 'diplomacy', 'Blueprint sale failed: the seller no longer qualifies.'); continue; }
        if (isUnlocked(S, p.id, pl.key)) { rep(p.id, 'diplomacy', `You already have ${B[pl.key].name}.`); continue; }
        if (p.credits < pl.price) { both(pr.from, p.id, 'diplomacy', `Blueprint sale of ${B[pl.key].name} failed: ${p.name} lacked ${pl.price} credits.`); continue; }
        p.credits -= pl.price; from.credits += pl.price; p.blueprints.push(pl.key);
        both(pr.from, p.id, 'diplomacy', `${p.name} bought the ${B[pl.key].name} blueprint from ${from.name} for ${pl.price} credits.`);
      } else if (pr.kind === 'route') {
        const r = S.routes.find((x) => x.id === pl.route);
        if (r) { r.accepted = true; both(pr.from, p.id, 'logistics', `Trade route #${r.id} between ${from.name} and ${p.name} is open.`); }
      }
    }
    for (const pr of S.proposals) if (pr.turn === turn && !pr.answered) {
      rep(pr.from, 'diplomacy', `${pname(pr.to)} did not answer ${describeProposal(S, pr)}; it expired.`);
      if (pr.kind === 'route') removeRoute(pr.payload.route, 'the partner did not accept in time');
    }
    S.proposals = S.proposals.filter((pr) => pr.turn > turn);

    for (const p of active) for (const o of O[p.id].diplo) {
      const target = o.to != null ? S.players[o.to] : null;
      switch (o.type) {
        case 'credits': {
          const amt = Math.floor(Number(o.amount) || 0);
          if (!target || target.eliminated || amt <= 0 || target.id === p.id) break;
          if (p.credits < amt) { rep(p.id, 'diplomacy', `Could not send ${amt} credits to ${target.name}: not enough credits.`); break; }
          p.credits -= amt; target.credits += amt;
          both(p.id, target.id, 'diplomacy', `${p.name} sent ${amt} credits to ${target.name}.`);
          break;
        }
        case 'declare': {
          if (!target || target.eliminated || target.id === p.id) break;
          if (atWar(S, p.id, target.id)) break;
          const pact = S.treaties.find((t) => t.type === 'peace' && pairs(t, p.id, target.id));
          if (pact) { rep(p.id, 'diplomacy', `You cannot declare war on ${target.name} before turn ${pact.endsTurn}: your peace treaty is still in force.`); break; }
          S.wars.push({ id: S.nextId++, a: p.id, b: target.id, kind: 'war', since: turn });
          S.treaties = S.treaties.filter((t) => !pairs(t, p.id, target.id));
          for (const r of S.routes.slice()) if ((r.owner === p.id && r.partner === target.id) || (r.owner === target.id && r.partner === p.id)) removeRoute(r.id, 'war was declared');
          for (const q of S.players) if (!q.eliminated) rep(q.id, 'diplomacy', `${p.name} declared war on ${target.name}.`);
          break;
        }
        case 'cancelTreaty': {
          const t = S.treaties.find((x) => x.id === o.id && (x.a === p.id || x.b === p.id));
          if (!t || t.endsTurn != null || t.type === 'peace') break;
          t.endsTurn = turn + 1;
          both(t.a, t.b, 'diplomacy', `${p.name} cancelled ${t.type} rights; they end after next turn.`);
          break;
        }
        default: break;
      }
    }
    // end-of-game votes and new proposals
    for (const p of active) p.endVote = O[p.id].diplo.some((o) => o.type === 'endVote');
    for (const p of active) for (const o of O[p.id].diplo) {
      if (o.type !== 'propose') continue;
      const to = S.players[o.to];
      if (!to || to.eliminated || to.id === p.id) continue;
      let pl = o.payload || {};
      if (o.kind === 'peace') {
        pl = normPeace(pl);
        const err = checkPeace(S, p.id, to.id, pl);
        if (err) { rep(p.id, 'diplomacy', `Peace treaty not sent to ${to.name}: ${err}.`); continue; }
      } else if (o.kind === 'treaty') {
        if (!['transit', 'port', 'rail'].includes(pl.type) || atWar(S, p.id, to.id)) continue;
      } else if (o.kind === 'blueprint') {
        if (!B[pl.key] || !p.researched.includes(pl.key)) { rep(p.id, 'diplomacy', 'You can only sell blueprints you researched yourself.'); continue; }
        pl.price = Math.max(0, Math.floor(Number(pl.price) || 0));
      } else continue;
      const pr = { id: S.nextId++, from: p.id, to: to.id, kind: o.kind, payload: pl, turn: turn + 1 };
      S.proposals.push(pr);
      both(p.id, to.id, 'diplomacy', `${p.name} proposed ${describeProposal(S, pr)} to ${to.name}.`);
    }

    /* ----- 1. combat ----- */
    const attacks = [];
    for (const p of active) for (const a of O[p.id].attacks) {
      if (a.unit != null) {
        const u = unitById(S, a.unit);
        if (!u || u.owner !== p.id || u.carriedBy != null || U[u.type].role !== 'combat') { rep(p.id, 'conflict', `Attack order skipped: unit #${a.unit} is not available.`); continue; }
        if (attacks.some((x) => x.src.unit === u.id)) continue;
        if (dist(S.map, u.t, a.t) > U[u.type].range) { rep(p.id, 'conflict', `${unitName(u)} could not attack ${tileLabel(S, a.t)}: out of range.`); continue; }
        const tgt = pickTarget(S, u.type, p.id, a.t);
        if (!tgt) { rep(p.id, 'conflict', `${unitName(u)} found no enemy it can hit at ${tileLabel(S, a.t)}.`); continue; }
        const ammo = drawGoods(supplySources(S, u), { ammo: U[u.type].ammo }, true);
        if (!ammo.ok) { rep(p.id, 'conflict', `${unitName(u)} could not attack: no ammo in supply range.`); continue; }
        attacks.push({ owner: p.id, key: u.type, src: { unit: u.id }, name: unitName(u), from: u.t, tgt });
      } else if (a.city != null) {
        const c = cityById(S, a.city), w = a.w;
        if (!c || c.owner !== p.id || !B[w] || !B[w].weapon || !countB(S, c.id, w)) continue;
        if (attacks.some((x) => x.src.city === c.id && x.key === w)) continue;
        if (dist(S.map, c.t, a.t) > R.WEAPON_RANGE) continue;
        const tgt = pickTarget(S, w, p.id, a.t);
        if (!tgt || !tgt.unit) { rep(p.id, 'conflict', `${c.name}'s ${B[w].name.toLowerCase()} found no target at ${tileLabel(S, a.t)}.`); continue; }
        if ((c.stock.ammo || 0) < R.WEAPON_AMMO) { rep(p.id, 'conflict', `${c.name}'s ${B[w].name.toLowerCase()} could not fire: needs ${R.WEAPON_AMMO} ammo in the city.`); continue; }
        c.stock.ammo -= R.WEAPON_AMMO;
        attacks.push({ owner: p.id, key: w, src: { city: c.id }, name: `${c.name} ${B[w].name.toLowerCase()}`, from: c.t, tgt });
      }
    }
    const dmgU = new Map(), dmgC = new Map();
    const addD = (map, id, v) => map.set(id, (map.get(id) || 0) + v);
    for (const at of attacks) {
      if (at.tgt.city) {
        const v = R.dmg(at.key, 'city');
        addD(dmgC, at.tgt.city.id, v);
        both(at.owner, at.tgt.city.owner, 'combat', `${pname(at.owner)}'s ${at.name} hit ${at.tgt.city.name} for ${v}.`);
      } else {
        const tu = at.tgt.unit, v = R.dmg(at.key, tu.type);
        addD(dmgU, tu.id, v);
        both(at.owner, tu.owner, 'combat', `${pname(at.owner)}'s ${at.name} hit ${pname(tu.owner)}'s ${unitName(tu)} for ${v}.`);
        if (at.src.unit != null && dist(S.map, at.from, tu.t) <= 1) {
          const rv = Math.floor(R.dmg(tu.type, at.key) / 2);
          if (rv > 0) { addD(dmgU, at.src.unit, rv); both(at.owner, tu.owner, 'combat', `${unitName(tu)} struck back at ${at.name} for ${rv}.`); }
        }
      }
    }
    for (const [cid, v] of dmgC) { const c = cityById(S, cid); c.hp = Math.max(0, c.hp - v); c.attacked = true; if (c.hp === 0) rep(c.owner, 'combat', `${c.name}'s defenses are down (0 HP). Its garrison is now exposed.`); }
    for (const [uid, v] of dmgU) { const u = unitById(S, uid); if (u) u.hp -= v; }
    for (const u of S.units.slice()) if (u.hp <= 0 && S.units.includes(u)) destroyUnit(u, 'killed in combat');

    /* ----- 2. movement ----- */
    // boarding
    for (const p of active) for (const b of O[p.id].board) {
      const u = unitById(S, b.unit), tr = unitById(S, b.transport);
      if (!u || !tr || u.owner !== p.id || tr.owner !== p.id || u.carriedBy != null || tr.carriedBy != null || u.route != null) continue;
      const why = canCarry(S, tr, u);
      if (why) { rep(p.id, 'conflict', `${unitName(tr)} cannot carry ${unitName(u)}: ${why}.`); continue; }
      if (dist(S.map, u.t, tr.t) > 1) { rep(p.id, 'conflict', `${unitName(u)} must be next to ${unitName(tr)} to board.`); continue; }
      if (u.t !== tr.t) u.moved += 1;
      u.carriedBy = tr.id; u.t = tr.t;
      rep(p.id, 'movement', `${unitName(u)} boarded ${unitName(tr)}.`);
    }
    // moves
    const movers = [];
    for (const p of active) for (const mv of O[p.id].moves) {
      const u = unitById(S, mv.unit);
      if (!u || u.owner !== p.id) continue;
      if (movers.some((x) => x.u === u)) continue;
      if (u.carriedBy != null) { rep(p.id, 'conflict', `${unitName(u)} is aboard a transport and moves with it.`); continue; }
      if (u.route != null) { rep(p.id, 'conflict', `${unitName(u)} is assigned to route #${u.route}; remove it from the route to move it by hand.`); continue; }
      const path = Array.isArray(mv.path) ? mv.path.map(Number) : [];
      if (path.length < 2 || path[0] !== u.t) { rep(p.id, 'conflict', `${unitName(u)}'s move order no longer starts where it stands; it stayed put.`); continue; }
      if (path.length - 1 > U[u.type].move) { rep(p.id, 'conflict', `${unitName(u)} cannot move that far.`); continue; }
      let ok = true;
      for (let k = 1; k < path.length; k++) {
        if (dist(S.map, path[k - 1], path[k]) !== 1 || !canEnter(S, u, path[k], { final: k === path.length - 1 })) { ok = false; break; }
        const c = cityAt(S, path[k]);
        if (k < path.length - 1 && c && !friendly(S, c.owner, u.owner) && U[u.type].cls !== 'ship') { ok = false; break; }
      }
      if (!ok) { rep(p.id, 'conflict', `${unitName(u)}'s path is blocked; it stayed at ${tileLabel(S, u.t)}.`); continue; }
      movers.push({ u, path, dest: path[path.length - 1], bounced: false });
    }
    const slot = (u) => (U[u.type].role !== 'combat' ? (U[u.type].cls === 'ship' ? 'SL' : 'LL') : U[u.type].cls === 'ship' ? 'S' : 'L');
    for (let guard = 0, changed = true; changed && guard < 60; guard++) {
      changed = false;
      const occ = new Map();
      const put = (t, u, m) => { if (!occ.has(t)) occ.set(t, []); occ.get(t).push({ u, m }); };
      for (const u of S.units) if (u.carriedBy == null && !movers.some((m) => m.u === u && !m.bounced)) put(u.t, u, null);
      for (const m of movers) if (!m.bounced) put(m.dest, m.u, m);
      for (const [t, list] of occ) {
        if (!list.some((x) => x.m)) continue;
        const city = cityAt(S, t);
        const L = list.filter((x) => slot(x.u) === 'L');
        const Sh = list.filter((x) => slot(x.u) === 'S' && !(city && dockable(S, city, x.u)));
        const LL = city ? [] : list.filter((x) => slot(x.u) === 'LL');
        const SL = city ? [] : list.filter((x) => slot(x.u) === 'SL');
        const hostile = list.some((a) => list.some((b) => !friendly(S, a.u.owner, b.u.owner)));
        const captureCase = city && L.length === 1 && L[0].m && !friendly(S, city.owner, L[0].u.owner) && list.every((x) => x.m === L[0].m || (!x.m && U[x.u.type].role !== 'combat'));
        const bounce = (group, why) => {
          for (const x of group) if (x.m && !x.m.bounced) {
            x.m.bounced = true; changed = true;
            rep(x.u.owner, 'conflict', `${unitName(x.u)} could not enter ${tileLabel(S, t)}: ${why}. It stayed where it was.`);
          }
        };
        if (hostile && !captureCase) bounce(list, 'another nation\'s unit is there or tried to move in');
        if (L.length > 1) bounce(L, 'another combat unit tried to occupy it (one per tile)');
        if (Sh.length > 1) bounce(Sh, 'another warship tried to occupy it (one combat ship per tile)');
        if (LL.length > R.STACK.logistics) bounce(LL, `only ${R.STACK.logistics} logistics units fit on a tile`);
        if (SL.length > R.STACK.logistics) bounce(SL, `only ${R.STACK.logistics} transport ships fit on a tile`);
      }
    }
    for (const m of movers) {
      if (m.bounced) continue;
      m.u.t = m.dest; m.u.moved += m.path.length - 1;
      for (const x of carried(S, m.u)) x.t = m.dest;
    }
    // captures
    for (const m of movers) {
      if (m.bounced || !S.units.includes(m.u)) continue;
      const c = cityAt(S, m.u.t);
      if (!c || friendly(S, c.owner, m.u.owner)) continue;
      const defenders = unitsAt(S, c.t).filter((x) => x !== m.u && U[x.type].role === 'combat' && U[x.type].cls === 'land');
      if (!U[m.u.type].capture || !atWar(S, c.owner, m.u.owner) || c.hp > 0 || defenders.length) continue;
      const loser = S.players[c.owner], by = m.u.owner;
      for (const x of unitsAt(S, c.t)) if (!friendly(S, x.owner, by)) destroyUnit(x, `caught when ${c.name} fell`);
      const old = c.owner, last = citiesOf(S, loser.id).length <= 1;
      c.owner = by; c.hp = 0;
      for (const tile of S.map.tiles) if (tile.owner === c.id) { if (tile.rail === old) tile.rail = by; if (tile.bridgeBy === old) tile.bridgeBy = by; }
      for (const r of S.routes.slice()) if (r.from === c.id || (r.to.type === 'city' && r.to.id === c.id)) removeRoute(r.id, `${c.name} was captured`);
      for (const q of S.players) if (!q.eliminated) rep(q.id, 'combat', `${pname(by)} captured ${c.name} from ${pname(old)}, with every good stored there.`);
      if (last) eliminate(loser, by);
    }
    // unloading
    for (const p of active) for (const o of O[p.id].unload) {
      const u = unitById(S, o.unit);
      if (!u || u.owner !== p.id || u.carriedBy == null) continue;
      const tr = unitById(S, u.carriedBy), t = Number(o.t);
      if (!tr || dist(S.map, tr.t, t) > 1) { rep(p.id, 'conflict', `${unitName(u)} must unload next to its transport.`); continue; }
      const probe = Object.assign({}, u, { carriedBy: null });
      if (!canEnter(S, probe, t, { final: true }) || cityAtHostile(t, p.id)) { rep(p.id, 'conflict', `${unitName(u)} cannot unload onto ${tileLabel(S, t)}.`); continue; }
      if (!slotFree(S, u, t)) { rep(p.id, 'conflict', `${unitName(u)} cannot unload: ${tileLabel(S, t)} is full.`); continue; }
      u.carriedBy = null; u.t = t; u.moved += t === tr.t ? 0 : 1;
      rep(p.id, 'movement', `${unitName(u)} unloaded at ${tileLabel(S, t)}.`);
    }
    function cityAtHostile(t, pid) { const c = cityAt(S, t); return c && !friendly(S, c.owner, pid); }

    /* ----- 3 & 4. global market: buys, then sells ----- */
    const buysBy = {};
    for (const p of active) for (const o of O[p.id].buys) {
      const g = o.good, amt = Math.floor(Number(o.amount) || 0), c = cityById(S, o.city);
      if (!GOODS.includes(g) || amt <= 0 || !c || c.owner !== p.id) continue;
      (buysBy[g] = buysBy[g] || []).push({ p, g, amt, c });
    }
    for (const g of GOODS) {
      const list = buysBy[g];
      if (!list) continue;
      const pool = S.market.pool[g] || 0, total = list.reduce((a, x) => a + x.amt, 0);
      const scale = total > pool ? pool / total : 1;
      for (const x of list) {
        let q = Math.floor(x.amt * scale);
        const price = prices[g].sell;
        q = Math.min(q, Math.floor(x.p.credits / price), freeSpace(S, x.c, g), S.market.pool[g] || 0);
        if (q <= 0) { rep(x.p.id, 'market', `Market purchase of ${R.GOOD_NAMES[g].toLowerCase()} for ${x.c.name} could not be filled (supply, credits or storage).`); continue; }
        x.p.credits -= q * price; S.market.pool[g] -= q; addToCity(S, x.c, g, q);
        rep(x.p.id, 'market', `Bought ${q} ${R.GOOD_NAMES[g].toLowerCase()} for ${q * price} credits, delivered to ${x.c.name}${q < x.amt ? ` (ordered ${x.amt})` : ''}.`);
      }
    }
    for (const p of active) for (const o of O[p.id].sells) {
      const g = o.good, c = cityById(S, o.city);
      let amt = Math.floor(Number(o.amount) || 0);
      if (!GOODS.includes(g) || amt <= 0 || !c || c.owner !== p.id) continue;
      amt = Math.min(amt, c.stock[g] || 0);
      if (amt <= 0) { rep(p.id, 'market', `Nothing to sell: ${c.name} has no ${R.GOOD_NAMES[g].toLowerCase()}.`); continue; }
      c.stock[g] -= amt; S.market.pool[g] = (S.market.pool[g] || 0) + amt; p.credits += amt * prices[g].pays;
      rep(p.id, 'market', `Sold ${amt} ${R.GOOD_NAMES[g].toLowerCase()} from ${c.name} for ${amt * prices[g].pays} credits.`);
    }

    /* ----- 5. research ----- */
    for (const p of active) for (const key of O[p.id].research) {
      const d = B[key];
      if (!d || isUnlocked(S, p.id, key)) continue;
      if (p.science < d.sci) { rep(p.id, 'research', `Not enough science for ${d.name} (needs ${d.sci}, have ${p.science}).`); continue; }
      p.science -= d.sci; p.researched.push(key);
      rep(p.id, 'research', `Researched ${d.name} for ${d.sci} science.`);
    }

    /* ----- 6. production (before construction, so this turn's output can be built with) ----- */
    for (const p of active) {
      const order = (k) => { const i = p.priority.indexOf(k); return i < 0 ? 999 : i; };
      const blds = S.buildings.filter((b) => buildingOwner(S, b) === p.id && B[b.key].recipes).sort((a, b) => order(a.key) - order(b.key) || a.id - b.id);
      const shortfalls = {};
      for (const b of blds) {
        const c = cityById(S, b.city), rc = recipeOf(b), d = B[b.key];
        if (b.halted) { b.status = 'Halted'; b.lastOut = {}; continue; }
        const out = buildingOutput(S, b);
        const why = [];
        if ((rc.mp || 0) > p.manpower) why.push(`${rc.mp} manpower`);
        if ((rc.credits || 0) > p.credits) why.push(`${rc.credits} credits`);
        for (const [g, v] of Object.entries(rc.in || {})) if ((c.stock[g] || 0) < v) why.push(`${v} ${R.GOOD_NAMES[g].toLowerCase()}`);
        if (why.length) {
          b.status = `Idle: missing ${why.join(', ')}`; b.lastOut = {};
          const key = `${c.name}|${d.short || d.name}|${why.join(', ')}`;
          shortfalls[key] = (shortfalls[key] || 0) + 1;
          continue;
        }
        p.manpower -= rc.mp || 0; p.credits -= rc.credits || 0;
        takeGoods(c.stock, rc.in || {});
        const made = {}, lost = {};
        for (const [g, v] of Object.entries(out)) { const a = addToCity(S, c, g, v); made[g] = a; if (a < v) lost[g] = v - a; }
        if (rc.mpOut) { p.manpower += rc.mpOut; made.manpower = rc.mpOut; }
        if (rc.sciOut) { p.science += rc.sciOut; made.science = rc.sciOut; }
        if (rc.creditsOut) { p.credits += rc.creditsOut; made.credits = rc.creditsOut; }
        b.lastOut = made;
        b.status = Object.keys(lost).length ? `Running, but storage full: lost ${goodsText(lost)}` : 'Running';
        if (Object.keys(lost).length) rep(p.id, 'shortfall', `${c.name}: ${d.short || d.name} output lost to full storage (${goodsText(lost)}). Build storage or move goods out.`);
      }
      for (const [key, n] of Object.entries(shortfalls)) {
        const [cn, bn, why] = key.split('|');
        rep(p.id, 'shortfall', `${cn}: ${n > 1 ? `${n}× ` : ''}${bn} idle, missing ${why}.`);
      }
    }

    /* ----- 7. buildings: demolition, new cities, construction ----- */
    for (const p of active) for (const o of O[p.id].demolish) {
      const err = checkDemolish(S, p.id, o);
      if (err) { rep(p.id, 'construction', `Could not demolish at ${tileLabel(S, o.t)}: ${err}.`); continue; }
      if (p.manpower < R.DEMOLISH.mp) { rep(p.id, 'construction', `Could not demolish at ${tileLabel(S, o.t)}: needs ${R.DEMOLISH.mp} manpower.`); continue; }
      const tile = S.map.tiles[o.t];
      let key;
      if (o.what === 'building') { const b = tileBuilding(S, o.t); key = b.key; S.buildings = S.buildings.filter((x) => x !== b); }
      else if (o.what === 'trap') { key = 'tankTrap'; tile.trap = null; }
      else if (o.what === 'rail') { key = 'railroad'; tile.rail = null; }
      else { key = tile.bridge === 'rail' ? 'railBridge' : 'bridge'; if (tile.bridge === 'rail') tile.rail = null; tile.bridge = false; tile.bridgeBy = null; }
      p.manpower -= R.DEMOLISH.mp;
      const dest = tileOwnerCity(S, o.t) || nearestCity(p.id, o.t);
      const back = {};
      if (dest) for (const [g, v] of Object.entries(goodsOnly(B[key].cost))) { const a = addToCity(S, dest, g, Math.floor(v * R.DEMOLISH.refund)); if (a) back[g] = a; }
      rep(p.id, 'construction', `Demolished ${B[key].name.toLowerCase()} at ${tileLabel(S, o.t)}; ${goodsText(back)} returned to ${dest ? dest.name : 'nowhere'}.`);
    }
    for (const p of active) for (const o of O[p.id].clear) {
      const err = checkClear(S, p.id, o);
      if (err) { rep(p.id, 'construction', `Could not clear the forest at ${tileLabel(S, o.t)}: ${err}.`); continue; }
      const c = tileOwnerCity(S, o.t), CF = R.CLEAR_FOREST;
      c.stock.tools -= CF.tools; p.manpower -= CF.mp;
      S.map.tiles[o.t].type = 'grassland';
      const got = addToCity(S, c, 'lumber', CF.lumber);
      rep(p.id, 'construction', `Cleared the forest at ${tileLabel(S, o.t)}; ${got} lumber went to ${c.name}${got < CF.lumber ? ` (${CF.lumber - got} lost for lack of storage)` : ''}. The tile is now grassland.`);
    }
    for (const p of active) for (const f of O[p.id].found) {
      const err = checkFound(S, p.id, f.unit);
      if (err) { rep(p.id, 'construction', `Could not found a city: ${err}.`); continue; }
      const u = unitById(S, f.unit);
      takeGoods(u.cargo, R.CITY.foundCost); p.manpower -= R.CITY.foundMp;
      const name = String(f.name || '').trim().slice(0, 40) || `${p.name} ${citiesOf(S, p.id).length + 1}`;
      const c = foundCityAt(S, p.id, u.t, name);
      rep(p.id, 'construction', `Founded ${c.name} at ${tileLabel(S, c.t)}.`);
    }
    for (const p of active) for (const o of O[p.id].builds) {
      const err = checkBuild(S, p.id, o);
      const d = B[o.key];
      if (err) { rep(p.id, 'construction', `Could not build ${d ? d.name : o.key}: ${err}.`); continue; }
      const c = cityById(S, o.city);
      if (!hasGoods(c.stock, d.cost)) { rep(p.id, 'construction', `Could not build ${d.name} in ${c.name}: needs ${goodsText(goodsOnly(d.cost))} in the city.`); continue; }
      if (p.manpower < (d.cost.mp || 0)) { rep(p.id, 'construction', `Could not build ${d.name}: needs ${d.cost.mp} manpower.`); continue; }
      takeGoods(c.stock, d.cost); p.manpower -= d.cost.mp || 0;
      if (d.place === 'infra') {
        const tile = S.map.tiles[o.t];
        if (o.key === 'railroad') tile.rail = p.id;
        else if (o.key === 'railBridge') { tile.bridge = 'rail'; tile.rail = p.id; tile.bridgeBy = p.id; }
        else { tile.bridge = true; tile.bridgeBy = p.id; }
      } else if (o.key === 'tankTrap') {
        S.map.tiles[o.t].trap = c.id;
      } else {
        const b = { id: S.nextId++, key: o.key, city: c.id, t: d.place === 'tile' ? o.t : c.t, product: d.recipes ? Object.keys(d.recipes)[0] : null, status: 'new' };
        if (o.product && d.recipes && d.recipes[o.product]) b.product = o.product;
        S.buildings.push(b);
        if (o.key === 'townHall') claim(S, c);
        if (d.hp) c.hp = Math.min(maxHp(S, c), c.hp + d.hp);
      }
      rep(p.id, 'construction', `Built ${d.name}${d.place === 'city' ? ` in ${c.name}` : ` at ${tileLabel(S, o.t)}`}.`);
    }

    /* ----- 8. units ----- */
    for (const p of active) {
      const usedBuilders = {};
      for (const o of O[p.id].trains) {
        const d = U[o.type];
        const err = checkTrain(S, p.id, o.city, o.type);
        if (err) { rep(p.id, 'recruitment', `Could not build ${d ? d.name : o.type}: ${err}.`); continue; }
        const c = cityById(S, o.city);
        const builderKeys = d.builtAt.filter((k) => countB(S, c.id, k));
        const slots = builderKeys.reduce((n, k) => n + countB(S, c.id, k), 0);
        const used = builderKeys.reduce((n, k) => n + (usedBuilders[`${c.id}:${k}`] || 0), 0);
        if (used >= slots) { rep(p.id, 'recruitment', `${c.name} has no free ${builderKeys.map((k) => B[k].name.toLowerCase()).join('/')} this turn (one unit per building per turn).`); continue; }
        if (!hasGoods(c.stock, d.cost)) { rep(p.id, 'recruitment', `Could not build ${d.name} in ${c.name}: needs ${goodsText(goodsOnly(d.cost))}.`); continue; }
        if (p.manpower < d.cost.mp) { rep(p.id, 'recruitment', `Could not build ${d.name}: needs ${d.cost.mp} manpower.`); continue; }
        // where does it appear?
        let t = null;
        if (d.cls === 'ship') {
          const probe = { type: o.type, owner: p.id };
          if (portOk(S, c, probe)) t = c.t;
          else t = nbrs(S.map, c.t).find((j) => isWater(S, j) && !unitsAt(S, j).some((x) => !friendly(S, x.owner, p.id)) && slotFree(S, probe, j)) ?? null;
        } else if (d.role === 'combat') {
          if (!garrisonOf(S, c)) t = c.t;
          else t = nbrs(S.map, c.t).find((j) => isLand(S, j) && S.map.tiles[j].owner === c.id && !cityAt(S, j) && !unitsAt(S, j).some((x) => !friendly(S, x.owner, p.id) || slot(x) === 'L')) ?? null;
        } else t = c.t;
        if (t == null) { rep(p.id, 'recruitment', `No room to place a new ${d.name} at ${c.name}.`); continue; }
        takeGoods(c.stock, d.cost); p.manpower -= d.cost.mp;
        const k = builderKeys.find((kk) => (usedBuilders[`${c.id}:${kk}`] || 0) < countB(S, c.id, kk));
        usedBuilders[`${c.id}:${k}`] = (usedBuilders[`${c.id}:${k}`] || 0) + 1;
        const u = { id: S.nextId++, type: o.type, owner: p.id, t, hp: d.hp, cargo: {}, carriedBy: null, route: null, leg: null, moved: 0, supply: 'new' };
        S.units.push(u);
        rep(p.id, 'recruitment', `${c.name} built ${unitName(u)}${t === c.t ? '' : ` at ${tileLabel(S, t)}`}.`);
      }
    }

    /* ----- 9. logistics ----- */
    // manual cargo transfers between a logistics unit and the city it stands in
    for (const p of active) for (const o of O[p.id].cargo) {
      const u = unitById(S, o.unit), c = cityById(S, o.city), g = o.good;
      let amt = Math.floor(Number(o.amount) || 0);
      if (!u || !c || u.owner !== p.id || c.owner !== p.id || !GOODS.includes(g) || !amt) continue;
      if (u.t !== c.t || !U[u.type].cargo) { rep(p.id, 'logistics', `${unitName(u)} must be in ${c.name} to load or unload.`); continue; }
      if (amt > 0) { const q = Math.min(amt, c.stock[g] || 0, cargoFree(u)); c.stock[g] = (c.stock[g] || 0) - q; addToUnit(u, g, q); rep(p.id, 'logistics', `${unitName(u)} loaded ${q} ${R.GOOD_NAMES[g].toLowerCase()} in ${c.name}.`); }
      else { const q = addToCity(S, c, g, Math.min(-amt, u.cargo[g] || 0)); u.cargo[g] -= q; rep(p.id, 'logistics', `${unitName(u)} unloaded ${q} ${R.GOOD_NAMES[g].toLowerCase()} in ${c.name}.`); }
    }
    // route changes
    for (const p of active) for (const o of O[p.id].routeOps) {
      if (o.op === 'remove') {
        const r = S.routes.find((x) => x.id === o.id);
        if (!r || (r.owner !== p.id && r.partner !== p.id)) continue;
        if (r.partner == null || !r.accepted) removeRoute(r.id, 'closed by its owner');
        else if (r.endsTurn == null) { r.endsTurn = turn + 1; both(r.owner, r.partner, 'logistics', `${p.name} cancelled trade route #${r.id}; it closes after next turn.`); }
        continue;
      }
      if (o.op !== 'create' && o.op !== 'update') continue;
      let r = o.op === 'update' ? S.routes.find((x) => x.id === o.id && x.owner === p.id) : null;
      if (o.op === 'update' && !r) continue;
      const from = cityById(S, o.op === 'create' ? o.from : r.from);
      const toRef = o.op === 'create' ? o.to : r.to;
      if (!from || from.owner !== p.id) { rep(p.id, 'logistics', 'Route must start at one of your cities.'); continue; }
      let partner = null;
      if (toRef.type === 'city') {
        const tc = cityById(S, toRef.id);
        if (!tc || tc.id === from.id) { rep(p.id, 'logistics', 'Route needs a different destination city.'); continue; }
        if (tc.owner !== p.id) partner = tc.owner;
      } else {
        const tu = unitById(S, toRef.id);
        if (!tu || tu.owner !== p.id || !U[tu.type].cargo) { rep(p.id, 'logistics', 'Route destination unit must be your own logistics unit.'); continue; }
      }
      if (partner != null && atWar(S, p.id, partner)) { rep(p.id, 'logistics', 'Cannot open a trade route with that nation now.'); continue; }
      const ids = (o.transports || []).map(Number).filter((id) => {
        const u = unitById(S, id);
        return u && u.owner === p.id && U[u.type].role === 'logistic' && u.carriedBy == null && (u.route == null || (r && u.route === r.id)) && !(toRef.type === 'unit' && toRef.id === id);
      });
      const goods = {}, back = {};
      for (const [g, v] of Object.entries(o.goods || {})) if (GOODS.includes(g) && Number(v) > 0) goods[g] = Math.floor(Number(v));
      for (const [g, v] of Object.entries(o.back || {})) if (GOODS.includes(g) && Number(v) > 0) back[g] = Math.floor(Number(v));
      if (!r) {
        r = { id: S.nextId++, owner: p.id, from: from.id, to: { type: toRef.type, id: toRef.id }, partner, accepted: partner == null, transports: [], rule: 'send', goods: {}, back: {}, priority: 'normal', status: 'new', endsTurn: null };
        S.routes.push(r);
        if (partner != null) {
          const pr = { id: S.nextId++, from: p.id, to: partner, kind: 'route', payload: { route: r.id, from: from.name, to: cityById(S, toRef.id).name }, turn: turn + 1 };
          S.proposals.push(pr);
          both(p.id, partner, 'logistics', `${p.name} proposed trade route #${r.id}: ${from.name} → ${cityById(S, toRef.id).name}, sending ${goodsText(goods)} and asking ${goodsText(back)} in return.`);
        } else rep(p.id, 'logistics', `Opened route #${r.id} from ${from.name}.`);
      }
      for (const id of r.transports) if (!ids.includes(id)) { const u = unitById(S, id); if (u) { u.route = null; u.leg = null; } }
      for (const id of ids) { const u = unitById(S, id); if (u.route !== r.id) { u.route = r.id; u.leg = 'toOrigin'; } }
      r.transports = ids;
      r.rule = o.rule === 'stock' ? 'stock' : 'send';
      r.goods = goods;
      if (partner != null) r.back = back;
      r.priority = PRIO[o.priority] != null ? o.priority : 'normal';
    }
    // run routes, highest priority first
    const runRoute = (r) => {
      const from = cityById(S, r.from);
      if (!from || from.owner !== r.owner) { removeRoute(r.id, 'origin city lost'); return; }
      const dest = r.to.type === 'city' ? cityById(S, r.to.id) : unitById(S, r.to.id);
      if (!dest || (r.to.type === 'city' && r.partner == null && dest.owner !== r.owner)) { removeRoute(r.id, 'destination lost'); return; }
      if (!r.accepted) { r.status = 'Waiting for partner'; return; }
      if (!r.transports.length) { r.status = 'No transports assigned'; return; }
      const notes = [];
      for (const id of r.transports.slice()) {
        const u = unitById(S, id);
        if (!u) continue;
        const d = U[u.type];
        let moves = d.move;
        const rt = (() => { const pth = findPath(S, u, from.t, dest.t, { partner: r.partner, ignoreUnits: true }); return pth ? Math.max(1, Math.ceil((2 * (pth.length - 1)) / d.move)) : 1; })();
        const arrive = () => {
          if (u.leg === 'out') {
            const delivered = {};
            for (const g of Object.keys(u.cargo)) {
              if (!(g in r.goods) || !(u.cargo[g] > 0)) continue;
              const a = r.to.type === 'city' ? addToCity(S, dest, g, u.cargo[g]) : addToUnit(dest, g, u.cargo[g]);
              u.cargo[g] -= a; if (a) delivered[g] = a;
            }
            if (Object.keys(delivered).length) {
              rep(r.owner, 'logistics', `Route #${r.id}: ${unitName(u)} delivered ${goodsText(delivered)} to ${dest.name || unitName(dest)}.`);
              if (r.partner != null) rep(r.partner, 'logistics', `Trade route #${r.id}: received ${goodsText(delivered)} in ${dest.name}.`);
            }
            if (r.partner != null && Object.keys(r.back).length) {
              const want = {}; let tot = 0;
              for (const [g, x] of Object.entries(r.back)) { const a = Math.min(x * rt, dest.stock[g] || 0); want[g] = a; tot += a; }
              const scale = tot > cargoFree(u) ? cargoFree(u) / tot : 1;
              const got = {};
              for (const [g, a] of Object.entries(want)) { const q = Math.floor(a * scale); if (q > 0) { dest.stock[g] -= q; addToUnit(u, g, q); got[g] = q; } }
              if (Object.keys(got).length) rep(r.partner, 'logistics', `Trade route #${r.id}: ${unitName(u)} loaded ${goodsText(got)} in ${dest.name} for ${pname(r.owner)}.`);
            }
            u.leg = 'back';
          } else {
            const unloaded = {};
            for (const g of Object.keys(u.cargo)) { if (!(u.cargo[g] > 0)) continue; const a = addToCity(S, from, g, u.cargo[g]); u.cargo[g] -= a; if (a) unloaded[g] = a; }
            if (Object.keys(unloaded).length && r.partner != null) rep(r.owner, 'logistics', `Trade route #${r.id}: ${unitName(u)} brought home ${goodsText(unloaded)} to ${from.name}.`);
            // load outbound goods
            const want = {}; let tot = 0;
            for (const [g, x] of Object.entries(r.goods)) {
              let a;
              if (r.rule === 'stock') {
                const at = r.to.type === 'city' ? (dest.stock[g] || 0) : (dest.cargo[g] || 0);
                const inTransit = r.transports.reduce((n, tid) => { const tu = unitById(S, tid); return n + (tu && tu !== u && tu.leg === 'out' ? (tu.cargo[g] || 0) : 0); }, 0);
                a = Math.max(0, x - at - inTransit);
              } else a = x * rt;
              a = Math.min(a, from.stock[g] || 0);
              want[g] = a; tot += a;
            }
            const free = cargoFree(u), scale = tot > free ? free / tot : 1;
            for (const [g, a] of Object.entries(want)) { const q = Math.floor(a * scale); if (q > 0) { from.stock[g] -= q; addToUnit(u, g, q); } }
            u.leg = 'out';
          }
        };
        for (let guard = 0; guard < 6; guard++) {
          const target = u.leg === 'out' ? dest.t : from.t;
          const there = u.t === target || (u.leg === 'out' && r.to.type === 'unit' && dist(S.map, u.t, target) <= 1);
          if (there) { arrive(); if (from.t === dest.t) break; continue; }
          if (moves <= 0) break;
          const path = findPath(S, u, u.t, target, { partner: r.partner });
          if (!path) { notes.push(`${unitName(u)} has no open path`); break; }
          let steps = Math.min(moves, path.length - 1);
          if (u.leg === 'out' && r.to.type === 'unit') steps = Math.min(steps, Math.max(0, path.length - 2));
          if (steps <= 0 && !(u.leg === 'out' && r.to.type === 'unit')) break;
          if (steps <= 0) { arrive(); continue; }
          // stop short of a non-city tile that already holds the maximum number of logistics units
          while (steps > 0 && !cityAt(S, path[steps]) && !slotFree(S, u, path[steps])) steps--;
          if (steps <= 0) { notes.push(`${unitName(u)} is waiting for room on a full tile`); break; }
          u.t = path[steps]; u.moved += steps; moves -= steps;
          for (const x of carried(S, u)) x.t = u.t;
          if (u.t !== target && !(u.leg === 'out' && r.to.type === 'unit' && dist(S.map, u.t, target) <= 1)) break;
        }
      }
      r.status = notes.length ? `Disrupted: ${notes.join('; ')}` : 'Running';
      if (notes.length) { rep(r.owner, 'logistics', `Route #${r.id} disrupted: ${notes.join('; ')}.`); }
    };
    for (const r of S.routes.slice().sort((a, b) => PRIO[a.priority] - PRIO[b.priority] || a.id - b.id)) if (S.routes.includes(r)) runRoute(r);

    // supply, upkeep, attrition and repairs
    for (const u of S.units.slice()) {
      if (!S.units.includes(u)) continue;
      const p = S.players[u.owner];
      const d = U[u.type], base = inBase(S, u);
      const need = upkeepOf(S, u, u.moved);
      const sources = supplySources(S, u);
      const res = drawGoods(sources, need, true);
      if (!res.ok) {
        u.hp -= 1; u.supply = `Out of supply (missing ${goodsText(res.missing)})`;
        rep(u.owner, 'supply', `${unitName(u)} at ${tileLabel(S, posOf(S, u))} is out of supply (missing ${goodsText(res.missing)}) and lost 1 HP.`);
        if (u.hp <= 0) { destroyUnit(u, 'attrition'); continue; }
      } else {
        u.supply = base ? 'In base (no upkeep)' : res.used.length ? `Supplied by ${res.used.map(sourceName).join(', ')}` : 'Supplied';
      }
      // repairs
      const reach = base || sources.some((s) => s.kind === 'city' || s.ref !== u);
      if (u.hp < d.hp && reach && res.ok) {
        let want = Math.min(base ? R.REPAIR.base : R.REPAIR.field, d.hp - u.hp), done = 0;
        for (let n = want; n > 0; n--) {
          const goods = d.repair === 'mech' ? { metal: n, tools: n } : d.repair === 'sail' ? { lumber: n } : {};
          if (d.repairHorses) goods.horses = Math.ceil(n / d.repairHorses);
          const mp = d.repair === 'bio' ? n : Math.ceil(n / 3);
          if (p.manpower < mp) continue;
          if (!drawGoods(sources, goods, false).ok) continue;
          drawGoods(sources, goods, true); p.manpower -= mp; done = n; break;
        }
        if (done) { u.hp += done; rep(u.owner, 'supply', `${unitName(u)} repaired ${done} HP.`); }
      }
    }
    // city regeneration
    for (const c of S.cities) if (!c.attacked && c.hp < maxHp(S, c)) c.hp = Math.min(maxHp(S, c), c.hp + R.CITY.regen);

    /* ----- end of turn ----- */
    const alive = S.players.filter((p) => !p.eliminated);
    if (alive.length === 1) S.gameOver = { turn, winners: [alive[0].id], reason: `${alive[0].name} is the last nation standing.` };
    else if (alive.length > 1 && alive.every((p) => p.endVote) && !alive.some((a) => alive.some((b) => atWar(S, a.id, b.id)))) {
      S.gameOver = { turn, winners: alive.map((p) => p.id), reason: `The remaining nations (${alive.map((p) => p.name).join(', ')}) all agreed to end the game in peace.` };
    }
    if (S.gameOver) for (const p of S.players) rep(p.id, 'game', `Game over: ${S.gameOver.reason}`);
    for (const p of S.players) { const list = S.reports[p.id] || []; S.reports[p.id] = list.filter((x) => x.turn > turn - 40); }
    S.history.push({ turn, at: Date.now() });
    S.turn = turn + 1;
    computePrices(S);
    return S;
  }

  return {
    R, newGame, resolveTurn, normalizeOrders, migrate, computePrices, worldTotals, makeRng,
    hex: { idx, colRow, dirs, nbrs, dist, within },
    q: {
      cityById, unitById, cityAt, unitsAt, cityBuildings, countB, tileBuilding, tileOwner, tileOwnerCity, citiesOf, unitsOf, unitName,
      garrisonOf, posOf, carried, atWar, friendly, hasTreaty, isUnlocked, unitUnlocked, territoryRadius, supplyRadius, maxHp,
      capacity, freeSpace, recipeOf, recipeKey, buildingOutput, buildingOwner, reachable, findPath, canEnter, pickTarget, attackTargets,
      cityWeaponTargets, supplySources, sourceName, upkeepOf, inBase, checkBuild, checkTrain, checkFound, routeEstimate, describeProposal,
      cargoUsed, cargoFree, portOk, dockable, slotFree, canCarry, carrySlots, demolishable, checkDemolish, checkClear, normPeace, checkPeace, peaceTerms, isWater, isLand, nearWater, tileLabel, goodsText, terrain,
    },
  };
})(typeof RULES !== 'undefined' ? RULES : require('./rules.js'));
if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
