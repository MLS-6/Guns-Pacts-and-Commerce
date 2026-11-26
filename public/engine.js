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
  const round1 = (x) => Math.round(x * 10) / 10; // HP, damage and manpower keep one decimal place
  const goodsText = (o) => Object.entries(o || {}).filter(([, v]) => v > 0).map(([g, v]) => `${Math.round(v * 100) / 100} ${(R.GOOD_NAMES[g] || g).toLowerCase()}`).join(', ') || 'nothing';

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
  const LAND_SHARE = { earth: 0.35, pangea: 0.5, continents: 0.5, islands: 0.42, oldNew: 0.58, mediterranean: 0.66, landlocked: 1 };
  // Earth: rough outlines of the real landmasses as [longitude, latitude] polygons (Antarctica left out).
  // The map spans longitude -170..190 (the Pacific at both edges) and latitude 78N..56S.
  const EARTH = {
    lon0: -170, lon1: 190, lat0: 78, lat1: -56,
    land: [
      // North America
      [[-168, 66], [-162, 70], [-140, 70], [-125, 70], [-95, 72], [-80, 73], [-65, 62], [-60, 55], [-55, 52], [-66, 45], [-70, 42], [-76, 35], [-81, 31], [-80, 25], [-82, 28], [-85, 30], [-90, 29], [-97, 27], [-97, 21], [-92, 18], [-87, 21], [-88, 15], [-83, 10], [-78, 8], [-82, 8], [-86, 12], [-92, 14], [-100, 17], [-106, 23], [-112, 29], [-110, 23], [-115, 30], [-118, 33], [-124, 40], [-124, 48], [-130, 54], [-140, 60], [-152, 58], [-158, 56], [-165, 60]],
      [[-120, 70], [-80, 70], [-70, 80], [-110, 78]], // Arctic islands
      [[-55, 60], [-45, 60], [-20, 70], [-18, 80], [-60, 82], [-72, 78], [-55, 70]], // Greenland
      // South America
      [[-80, 10], [-72, 12], [-62, 10], [-50, 0], [-35, -5], [-38, -13], [-40, -22], [-48, -27], [-58, -35], [-62, -40], [-66, -46], [-68, -53], [-74, -52], [-74, -42], [-72, -30], [-70, -18], [-76, -14], [-81, -5], [-80, 0], [-77, 7]],
      // Europe and Asia
      [[-10, 36], [-9, 43], [-2, 44], [-5, 48], [2, 51], [8, 54], [10, 57], [5, 62], [15, 69], [25, 71], [40, 68], [45, 68], [60, 70], [70, 73], [80, 73], [100, 77], [115, 74], [130, 71], [140, 72], [160, 70], [180, 68], [190, 66], [180, 62], [163, 60], [157, 52], [160, 60], [150, 59], [140, 54], [135, 43], [130, 42], [127, 39], [126, 35], [122, 40], [118, 38], [122, 31], [120, 25], [110, 20], [106, 10], [103, 1], [100, 6], [98, 16], [94, 17], [90, 22], [85, 20], [80, 15], [77, 8], [73, 17], [70, 22], [66, 25], [57, 25], [56, 27], [50, 30], [48, 29], [52, 24], [56, 26], [59, 22], [52, 16], [44, 12], [43, 15], [38, 22], [35, 28], [33, 31], [35, 36], [27, 36], [26, 40], [23, 37], [20, 40], [16, 38], [18, 40], [13, 45], [10, 44], [13, 38], [8, 44], [3, 43], [0, 39], [-6, 36]],
      // Africa
      [[-17, 21], [-10, 30], [-6, 36], [10, 37], [20, 32], [32, 31], [34, 28], [38, 18], [43, 12], [51, 12], [48, 5], [40, -3], [40, -15], [35, -24], [32, -29], [27, -34], [18, -35], [14, -22], [12, -6], [9, 3], [4, 6], [-8, 4], [-15, 10]],
      [[44, -25], [50, -15], [49, -12], [44, -17]], // Madagascar
      [[-6, 50], [2, 51], [-2, 57], [-5, 59], [-6, 56]], // Britain
      [[-24, 64], [-14, 64], [-15, 66], [-22, 66]], // Iceland
      [[130, 31], [141, 36], [142, 42], [145, 44], [140, 40], [132, 34]], // Japan
      [[95, 5], [106, -6], [102, -4]], // Sumatra
      [[109, 1], [117, 7], [119, 1], [115, -4], [110, -3]], // Borneo
      [[131, -1], [141, -3], [150, -10], [140, -8]], // New Guinea
      [[120, 18], [126, 7], [122, 7]], // Philippines
      // Australia
      [[114, -22], [122, -18], [130, -12], [137, -12], [142, -11], [146, -19], [153, -26], [150, -37], [141, -38], [135, -35], [130, -32], [115, -34]],
      [[172, -35], [178, -38], [174, -41], [167, -46], [170, -46]], // New Zealand
    ],
  };
  function inPoly(x, y, poly) {
    let inside = false;
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const [xa, ya] = poly[a], [xb, yb] = poly[b];
      if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside;
    }
    return inside;
  }
  const earthLand = (lon, lat) => EARTH.land.some((pl) => inPoly(lon, lat, pl) || inPoly(lon - 360, lat, pl) || inPoly(lon + 360, lat, pl));

  function genMap(nPlayers, rng, opts = {}) {
    const type = R.MAP.types[opts.mapType] ? opts.mapType : R.MAP.type;
    const tpp = R.MAP.sizes.includes(Number(opts.tilesPerPlayer)) ? Number(opts.tilesPerPlayer) : R.MAP.tilesPerPlayer;
    const N = nPlayers * tpp;
    const aspect = type === 'oldNew' ? 1.7 : type === 'earth' ? 2.3 : 1.35;
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
    } else if (type === 'earth') {
      // sample the outlines (3 x 3 points per tile, through a gentle warp so coasts are not ruler-straight),
      // then blur once so small islands and thin necks survive at small map sizes
      const raw = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        const c = i % w, r = Math.floor(i / w), [x0, y0] = pos(i);
        if (edgeOf(x0, y0) < 1.0 * small) { raw[i] = -1; continue; }
        let hit = 0;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
          const x = x0 + a / 3 + (wx(c, r) - 0.5) * 1.6, y = y0 + b / 3 * 0.866 + (wy(c, r) - 0.5) * 1.6;
          const lon = EARTH.lon0 + (x / W) * (EARTH.lon1 - EARTH.lon0), lat = EARTH.lat0 + (y / HH) * (EARTH.lat1 - EARTH.lat0);
          if (earthLand(lon, lat)) hit++;
        }
        raw[i] = hit / 9;
      }
      for (let i = 0; i < n; i++) {
        if (raw[i] < 0) continue;
        const nb = nbrs({ w, h }, i).map((j) => Math.max(0, raw[j]));
        score[i] = 0.6 * raw[i] + 0.4 * (nb.reduce((a, v) => a + v, 0) / Math.max(1, nb.length)) + 0.18 * detail(i % w, Math.floor(i / w));
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
    let share = LAND_SHARE[type];
    if (type === 'earth') share = Math.max(0.2, score.filter((v) => v >= 0.5).length / n); // land wherever the outline says
    if (share < 1 && type !== 'earth') {
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
    const K = type === 'continents' ? 3 : type === 'oldNew' ? 2 : type === 'earth' ? 4 : 0;
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
    const landN = m.tiles.filter((t) => TT[t.type].terrain !== 'water').length; // land and mountains
    const placeRegional = (type, spec) => {
      const total = Math.max(Math.ceil(nPlayers * (spec.minPerPlayer || 0)), Math.round(landN / spec.landPer));
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
    // Silver and gold: scattered one at a time anywhere on open land, well apart from each other
    const precious = [];
    for (const [type, spec] of [['gold', R.MAP.gold], ['silver', R.MAP.silver]]) {
      const want = Math.max(1, Math.round(landN / spec.landPer));
      const pool = shuffle([...Array(n).keys()].filter((j) => (isG(j) || ['forest', 'ore', 'coal'].includes(m.tiles[j].type)) && !reserved.has(j) && !starts.some((st) => dist(m, st, j) <= 2)), rng)
        .sort((a, b) => (isG(a) ? 0 : 1) - (isG(b) ? 0 : 1));
      let placed = 0;
      for (const gap of [4, 3, 2, 1]) for (const j of pool) {
        if (placed >= want) break;
        if (!isG(j) && !['forest', 'ore', 'coal'].includes(m.tiles[j].type)) continue;
        if (precious.some((q) => dist(m, q, j) < gap)) continue;
        m.tiles[j].type = type; precious.push(j); placed++;
      }
    }
    return { map: m, starts };
  }

  /* ---------------- lookups ---------------- */
  const cityById = (S, id) => S.cities.find((c) => c.id === id);
  const unitById = (S, id) => S.units.find((u) => u.id === id);
  const cityAt = (S, t) => S.cities.find((c) => c.t === t);
  const unitsAt = (S, t) => S.units.filter((u) => u.t === t && u.carriedBy == null);
  const cityBuildings = (S, cid) => S.buildings.filter((b) => b.city === cid);
  // Seasons: each turn is a month; months 10-12 of every 12-turn year are winter, 7-9 autumn
  const monthOf = (turn) => ((Math.max(1, turn) - 1) % 12) + 1;
  const yearOf = (turn) => Math.floor((Math.max(1, turn) - 1) / 12) + 1;
  const seasonOf = (turn) => { const m = monthOf(turn); return m >= 10 ? 'winter' : m >= 7 ? 'autumn' : m >= 4 ? 'summer' : 'spring'; };
  const isWinter = (turn) => seasonOf(turn) === 'winter';
  const isSummer = (turn) => seasonOf(turn) === 'summer';
  // the newspaper and war names use dates, not turn numbers: turn 1 is March of Year 1
  const dateText = (turn) => `${R.MONTH_NAMES[monthOf(turn) - 1]}, Year ${yearOf(turn)}`;
  const cleanWarName = (x) => String(x || '').replace(/\s+/g, ' ').trim().slice(0, R.PRESS.warNameMax);
  function autoWarName(S, turn, a, b) {
    const used = new Set((S.warNames || []).map((x) => x.toLowerCase()));
    const y = yearOf(turn), season = seasonOf(turn).replace(/^./, (c) => c.toUpperCase()), month = R.MONTH_NAMES[monthOf(turn) - 1];
    const pair = `The ${a.name}–${b.name} War`;
    for (const n of [`The ${season} War of Year ${y}`, `The ${month} War of Year ${y}`, pair]) if (!used.has(n.toLowerCase())) return n;
    for (let i = 2; ; i++) { const n = `${pair} (${i})`; if (!used.has(n.toLowerCase())) return n; }
  }
  // how the press describes a new unit design, from the way it differs from its base model
  function designPress(dz, p) {
    const st = dz.steps || {}, hp = st.hp || 0, dmg = st.dmg || 0, sp = st.speed || 0, cg = st.cargo || 0;
    const UP = (x) => String(x).toUpperCase(), base = U[dz.base].name.toLowerCase(), BASE = UP(base), X = UP(p.name);
    let head, desc;
    if (dmg > 0 && hp < 0) { head = `${X}'S NEW ${BASE} A GLASS CANNON, SAY EXPERTS`; desc = 'is a glass cannon: it packs a punch but cannot take one'; }
    else if (hp > 0 && hp >= dmg) { head = `${X} UNVEILS ${BASE} BUILT TO TAKE A HIT`; desc = 'is built to take a hit'; }
    else if (dmg > 0) { head = `${X} UNVEILS ${BASE} THAT PACKS A PUNCH`; desc = 'packs a punch'; }
    else if (sp > 0) { head = `${X} UNVEILS FAST NEW ${BASE}`; desc = 'is faster than any before it'; }
    else if (cg > 0) { head = `${X} UNVEILS BIGGER ${BASE}`; desc = 'carries more than any before it'; }
    else { head = `${X} UNVEILS NEW ${BASE}`; desc = 'is unlike any seen before'; }
    if (sp > 0 && !/faster/.test(desc)) desc += ', and it is fast';
    else if (sp < 0) desc += ', though it is slow';
    return { head, body: `Military observers report that ${p.name}'s new ${base} design, the ${dz.name}, ${desc}.` };
  }
  const warNameOf = (S, a, b) => { const w = (S.wars || []).find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a)); return w ? w.name || null : null; };
  const countB = (S, cid, key) => S.buildings.reduce((n, b) => n + (b.city === cid && b.key === key ? 1 : 0), 0);
  const tileBuilding = (S, t) => S.buildings.find((b) => b.t === t && B[b.key].place === 'tile');
  const tileOwnerCity = (S, t) => { const o = S.map.tiles[t].owner; return o == null ? null : cityById(S, o); };
  const tileOwner = (S, t) => { const c = tileOwnerCity(S, t); return c ? c.owner : null; };
  const citiesOf = (S, pid) => S.cities.filter((c) => c.owner === pid);
  const unitsOf = (S, pid) => S.units.filter((u) => u.owner === pid);
  const unitName = (u) => `${u.dname || U[u.type].name} #${u.id}`;
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
    const d = B[key] || R.DOCTRINES[key];
    if (!d) return false;
    if (d.sci === 0) return true;
    const p = S.players[pid];
    return p.researched.includes(key) || p.blueprints.includes(key);
  }
  const unitUnlocked = (S, pid, type) => isUnlocked(S, pid, U[type].unlock);

  /* ---------------- city stats & storage ---------------- */
  const territoryRadius = (S, c) => R.CITY.territory + (countB(S, c.id, 'townHall') ? 1 : 0);
  const supplyRadius = (S, c) => R.CITY.supplyRadius + Math.min(R.CITY.maxDepots, countB(S, c.id, 'supplyDepot'));
  function maxHp(S, c) {
    let hp = R.CITY.baseHp;
    for (const b of cityBuildings(S, c.id)) { const d = B[b.key]; if (d.place !== 'city') continue; hp += d.hp ? d.hp : R.CITY.hpPerBuilding; }
    return round1(hp);
  }
  function recipeOf(b) {
    const d = B[b.key];
    if (!d.recipes) return null;
    const keys = Object.keys(d.recipes);
    return d.recipes[d.recipes[b.product] ? b.product : keys[0]];
  }
  function recipeKey(b) { const d = B[b.key]; if (!d.recipes) return null; return d.recipes[b.product] ? b.product : Object.keys(d.recipes)[0]; }
  // Government helpers (needed by the economy functions below)
  const govKey = (S, pid) => { const p = S && S.players[pid]; return (p && p.gov) || 'provisional'; };
  const govOf = (S, pid) => R.GOVERNMENTS[govKey(S, pid)];
  // A production or extraction building: has a recipe and is not housing or a tax office
  const isProductionRc = (rc) => !!rc && !rc.mpOut && !(rc.creditsPerMp && !rc.labor);
  // Government multipliers for one building: communism scales production and housing; democracies run science cheaper
  function govMods(S, b) {
    const m = { out: 1, mp: 1, inputs: 1, credits: 1, sci: 1, labor: 1 };
    const rc = recipeOf(b);
    if (!rc || !S) return m;
    const g = govOf(S, buildingOwner(S, b));
    if (g.production && isProductionRc(rc)) { m.out = g.production.out; m.mp = g.production.mp; m.inputs = g.production.inputs; m.credits = g.production.inputs; m.sci = g.production.out; m.labor = g.production.mp; }
    if (g.housing && rc.mpOut) { m.inputs = g.housing.inputs; }
    if (g.science && rc.sciOut) { m.credits *= g.science.credits; m.mp *= g.science.mp; }
    // monarchy: extraction buildings on territory tiles need half the manpower (silver and gold mines hire workers instead)
    if (g.extractionMp && B[b.key].place === 'tile' && !rc.labor) m.mp *= g.extractionMp;
    return m;
  }
  // Output = base x (1 + sum of percentage bonuses) + flat bonuses (farm water +3, railroad +2)
  // opts.fueled: whether an era 3 building got its fuel (default: if its fuel switch is on)
  function buildingOutput(S, b, opts) {
    const rc = recipeOf(b);
    if (!rc) return {};
    const out = Object.assign({}, rc.out || {});
    const d = B[b.key];
    if (b.t == null) return out;
    const tile = S.map.tiles[b.t], river = nbrs(S.map, b.t).some((j) => S.map.tiles[j].type === 'river');
    if (d.oceanFood && tile.type === 'ocean') out.food = d.oceanFood;
    let pct = 0, flat = 0;
    if (d.riverBonus && river) pct += d.riverBonus;
    if (d.tier) {
      const fueled = opts && opts.fueled != null ? opts.fueled : b.fuelOn !== false;
      pct += d.tier === 3 && fueled ? d.fuelBonus : d.bonus;
    }
    const wet = d.waterMult && nbrs(S.map, b.t).some((j) => ['river', 'lake'].includes(S.map.tiles[j].type));
    if (d.railBonus && tile.rail != null) flat += d.railBonus;
    const sun = (d.base || b.key) === 'farm' && !(opts && opts.season === false) && isSummer(S.turn) ? R.SUMMER_FARM : 1;
    const own = buildingOwner(S, b), pl = S.players[own];
    const unrest = !(opts && opts.gov === false) && pl && pl.unrestUntil != null && S.turn <= pl.unrestUntil ? 1 - R.LOANS.unrestGoods : 1;
    const gm = (opts && opts.gov === false ? 1 : govMods(S, b).out) * unrest; // storage uses the normal output; unrest cuts goods 10%
    for (const g of Object.keys(out)) out[g] = round1((Math.round(out[g] * (1 + pct)) * (wet ? d.waterMult : 1) + flat) * sun * gm);
    return out;
  }
  // Goods a building uses when it runs: its recipe, plus 0.5 lumber upkeep for buildings in the city itself
  // (communism: the recipe's inputs ×2.5; the 0.5 lumber upkeep is unchanged)
  function inputsOf(b, S) {
    const rc = recipeOf(b), d = B[b.key], inp = Object.assign({}, (rc && rc.in) || {});
    const k = govMods(S, b).inputs;
    if (k !== 1) for (const g of Object.keys(inp)) inp[g] = round1(inp[g] * k);
    if (d.place === 'city' && R.CITY_RUN_LUMBER) inp.lumber = round1((inp.lumber || 0) + R.CITY_RUN_LUMBER);
    return inp;
  }
  const fuelUseOf = (S, b) => round1((B[b.key].fuelUse || 0) * govMods(S, b).inputs);
  const runCreditsOf = (S, b) => { const rc = recipeOf(b); return rc && rc.credits ? Math.round(rc.credits * govMods(S, b).credits) : 0; };
  const sciOutOf = (S, b) => { const rc = recipeOf(b); return rc && rc.sciOut ? round1(rc.sciOut * govMods(S, b).sci) : 0; };
  // Manpower a building needs per turn (factories by a river need 1 less)
  function mpOf(S, b) {
    const rc = recipeOf(b), d = B[b.key];
    if (!rc) return 0;
    let mp = rc.mp || 0;
    if (d.riverMpLess && b.t != null && nbrs(S.map, b.t).some((j) => S.map.tiles[j].type === 'river')) mp = Math.max(0, mp - d.riverMpLess);
    return Math.round(mp * govMods(S, b).mp * 100 + 1e-9) / 100;
  }
  // Tax
  const taxOf = (S, pid) => { const p = S.players[pid]; return govOf(S, pid).tax[(p && p.tax) || 'normal']; };
  // Manpower multiplier for a nation's housing: tax effect, minus the full-mobilization cut (0.2; communism 0.1),
  // minus 0.5 during upheaval; never below 0
  function mpMult(S, pid, turn) {
    const p = S.players[pid];
    if (!p) return 1;
    const g = govOf(S, pid);
    let m = taxOf(S, pid).mp - (p.mob === 'full' ? (g.fullMpCut != null ? g.fullMpCut : R.MOBILIZE.fullMpCut) : 0);
    if (p.upheavalUntil != null && (turn != null ? turn : S.turn) <= p.upheavalUntil) m -= R.GOV_CHANGE.upheavalMp;
    if (p.unrestUntil != null && (turn != null ? turn : S.turn) <= p.unrestUntil) m -= R.LOANS.unrestMp; // unrest after a domestic default
    return Math.max(0, Math.round(m * 1000) / 1000);
  }
  const taxCooldownEnds = (S, pid) => { const p = S.players[pid]; return p.taxSince == null ? 0 : p.taxSince + govOf(S, pid).taxEvery; };
  // What the market pays this nation per unit sold (democracy 90%, communism 60%, others 80% of the price)
  const sellPriceFor = (S, pid, g) => { const pr = (S.market.prices || {})[g]; if (!pr) return 0; const k = govOf(S, pid).marketSell || R.MARKET.buyRatio; return Math.max(1, Math.round(pr.sell * k)); };
  const govCooldownEnds = (S, pid) => { const p = S.players[pid]; return p.govSince == null ? 0 : p.govSince + R.GOV_CHANGE.every; };
  // Manpower a housing building makes, after the tax rate, mobilization and any government upheaval
  const marketTrickle = (S) => (S.marketTrickle != null ? S.marketTrickle : R.MARKET.trickle);
  function mpOutOf(S, b) {
    const rc = recipeOf(b);
    if (!rc || !rc.mpOut) return 0;
    const pid = buildingOwner(S, b), g = govOf(S, pid);
    return Math.round(rc.mpOut * (g.housing ? g.housing.out : 1) * mpMult(S, pid) * 100 + 1e-9) / 100;
  }
  // Workers (manpower per turn) assigned to a silver or gold mine (communism: 3× the cap, 2/3 the credits per worker)
  const maxLaborOf = (S, b) => { const rc = recipeOf(b); return rc && rc.maxLabor ? rc.maxLabor * govMods(S, b).labor : Infinity; };
  const laborOf = (b, S) => { const n = b.labor == null ? R.MINE_LABOR : b.labor; return Math.min(n, maxLaborOf(S, b)); };
  const perWorkerOf = (S, b) => { const rc = recipeOf(b), m = govMods(S, b); return rc.creditsPerMp * m.out / m.labor; };
  // Manpower a city's production and extraction buildings would use this turn (what a communist tax office taxes)
  const cityProductionMp = (S, cid) => S.buildings.filter((x) => x.city === cid && !x.halted && isProductionRc(recipeOf(x))).reduce((a, x) => a + (recipeOf(x).labor ? laborOf(x, S) : mpOf(S, x)), 0);
  // Credits a building makes. A tax office pays per manpower its city's housing made this turn
  // (mpMade); without that it estimates from the housing that is switched on.
  function creditsOutOf(S, b, mpMade) {
    const rc = recipeOf(b);
    if (!rc) return 0;
    if (rc.labor) return Math.round(laborOf(b, S) * perWorkerOf(S, b));
    if (rc.creditsPerMp) {
      const pid = buildingOwner(S, b), rate = taxOf(S, pid).rate; // the tax rate replaces the base 150 per manpower
      const onUse = govOf(S, pid).taxOnUse; // communism taxes manpower used in production, not manpower made
      const mp = mpMade != null ? mpMade : onUse ? cityProductionMp(S, b.city) : S.buildings.filter((x) => x.city === b.city && !x.halted && recipeOf(x) && recipeOf(x).mpOut).reduce((a, x) => a + mpOutOf(S, x), 0);
      return Math.round(mp * rate);
    }
    return rc.creditsOut || 0;
  }
  function capacity(S, c, g) {
    let cap = R.CITY.baseStorage;
    for (const b of cityBuildings(S, c.id)) {
      const d = B[b.key];
      if (d.storage && d.storage[g]) cap += d.storage[g];
      if (d.storageAll && !R.SPECIAL_STORAGE.includes(g)) cap += d.storageAll;
      const out = buildingOutput(S, b, { season: false, gov: false });
      if (out[g]) cap += R.CITY.productionStorageTurns * out[g];
    }
    return cap;
  }
  const freeSpace = (S, c, g) => Math.max(0, capacity(S, c, g) - (c.stock[g] || 0));
  function addToCity(S, c, g, n) { const add = Math.max(0, Math.min(n, freeSpace(S, c, g))); if (add) c.stock[g] = (c.stock[g] || 0) + add; return add; }
  const cargoUsed = (u) => sum(u.cargo);
  const cargoFree = (u) => Math.max(0, (u.cargoCap != null ? u.cargoCap : (U[u.type].cargo || 0)) - cargoUsed(u));
  function addToUnit(u, g, n) { const add = Math.max(0, Math.min(n, cargoFree(u))); if (add) u.cargo[g] = (u.cargo[g] || 0) + add; return add; }
  function hasGoods(stock, need) { for (const [g, v] of Object.entries(need)) if (g !== 'mp' && (stock[g] || 0) < v) return false; return true; }
  function takeGoods(stock, need) { for (const [g, v] of Object.entries(need)) if (g !== 'mp') stock[g] = (stock[g] || 0) - v; }
  const goodsOnly = (cost) => { const o = {}; for (const [g, v] of Object.entries(cost)) if (g !== 'mp') o[g] = v; return o; };
  /* ---------------- field depots ---------------- */
  const depotAt = (S, t) => (S.depots || []).find((d) => d.t === t);
  const depotById = (S, id) => (S.depots || []).find((d) => d.id === id);
  const isSettlement = (dp) => dp && dp.kind === 'settlement';
  const fieldDepots = (S) => (S.depots || []).filter((d) => !isSettlement(d));
  // A settlement stores exactly what a new city needs (plus the forest-clearing tools on a forest)
  const isMonarchy = (S, pid) => govKey(S, pid) === 'monarchy';
  const settlementBase = (S, pid) => (isMonarchy(S, pid) ? R.SETTLEMENT_MONARCHY.storage : R.SETTLEMENT.storage);
  // Build cost of a building for a nation (monarchies place settlements for 25% less)
  const buildCost = (S, pid, key) => {
    if (key === 'settlement' && isMonarchy(S, pid)) return Object.assign({}, R.SETTLEMENT_MONARCHY.cost);
    const g = govOf(S, pid);
    return g && g.costs && g.costs[key] ? g.costs[key] : B[key].cost;
  };
  const foundMpOf = (S, pid) => (isMonarchy(S, pid) ? R.SETTLEMENT_MONARCHY.foundMp : R.CITY.foundMp);
  function settlementNeeds(S, dp) {
    const need = Object.assign({}, settlementBase(S, dp.owner));
    if (S && S.map.tiles[dp.t].type === 'forest') need.tools = (need.tools || 0) + R.CLEAR_FOREST.tools;
    return need;
  }
  const depotCap = (g, dp, S) => (isSettlement(dp) ? (settlementNeeds(S, dp)[g] || 0) : R.DEPOT.storage[g] != null ? R.DEPOT.storage[g] : R.DEPOT.other);
  const depotFree = (dp, g, S) => Math.max(0, depotCap(g, dp, S) - (dp.stock[g] || 0));
  function addToDepot(dp, g, n, S) { const add = Math.max(0, Math.min(n, depotFree(dp, g, S))); if (add) dp.stock[g] = round1((dp.stock[g] || 0) + add); return add; }
  const depotName = (dp) => (isSettlement(dp) ? `Settlement #${dp.id}` : `Field depot #${dp.id}`);
  // Store goods near tile t for nation pid: cities whose supply range covers t first, then field depots in range,
  // then the nation's land logistics units within 2 tiles. Whatever does not fit is lost.
  function storeNear(S, pid, t, goods, skipUnit) {
    const stored = {}, lost = {};
    const cities = citiesOf(S, pid).filter((c) => dist(S.map, c.t, t) <= supplyRadius(S, c)).sort((a, b) => dist(S.map, a.t, t) - dist(S.map, b.t, t));
    const depots = fieldDepots(S).filter((d) => d.owner === pid && dist(S.map, d.t, t) <= R.DEPOT.supplyRange).sort((a, b) => dist(S.map, a.t, t) - dist(S.map, b.t, t));
    const units = S.units.filter((u) => u.owner === pid && u !== skipUnit && u.carriedBy == null && U[u.type].cargo && U[u.type].cls !== 'ship' && dist(S.map, u.t, t) <= R.CITY.unitSupplyRadius);
    for (const [g, v] of Object.entries(goods)) {
      let left = v;
      for (const c of cities) { if (left <= 0) break; const a = addToCity(S, c, g, left); left -= a; if (a) stored[g] = (stored[g] || 0) + a; }
      for (const d of depots) { if (left <= 0) break; const a = addToDepot(d, g, left, S); left -= a; if (a) stored[g] = (stored[g] || 0) + a; }
      for (const u of units) { if (left <= 0) break; const a = addToUnit(u, g, left); left -= a; if (a) stored[g] = (stored[g] || 0) + a; }
      if (left > 0) lost[g] = round1(left);
    }
    return { stored, lost };
  }

  /* ---------------- market ---------------- */
  function worldTotals(S) {
    const tot = {};
    for (const g of GOODS) tot[g] = S.market.pool[g] || 0;
    for (const c of S.cities) for (const g of GOODS) tot[g] += c.stock[g] || 0;
    for (const u of S.units) for (const g of GOODS) tot[g] += (u.cargo[g] || 0) + ((u.store || {})[g] || 0);
    for (const d of S.depots || []) for (const g of GOODS) tot[g] += d.stock[g] || 0;
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
    if (ter === 'mountain' && !(tile.tunnel != null && (d.cls === 'rail' || u.type === 'infantry'))) return false; // only trains and infantry use rail tunnels
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
      if (ter === 'water' && !tile.bridge) {
        // Infantry, cavalry and caravans can wade a river; entering it ends their move. Trade routes always need a bridge.
        if (!(tile.type === 'river' && d.ford && !opt.noFord && opt.final)) return false;
      }
      if (d.cls === 'rail') {
        const railOwner = city ? city.owner : tile.rail;
        if (railOwner == null) return false;
        if (!friendly(S, railOwner, u.owner) && railOwner !== partner && !hasTreaty(S, railOwner, u.owner, 'rail') && !atWar(S, railOwner, u.owner)) return false; // at war, an enemy's rail is yours to use
      }
      if (u.type === 'tank' && tile.trap != null && !opt.final) return false; // a tank trap ends a tank's move (friendly or enemy)
      if (owner != null && !friendly(S, owner, u.owner) && owner !== partner && !atWar(S, owner, u.owner) && !hasTreaty(S, owner, u.owner, 'transit')) return false;
      if (city && !friendly(S, city.owner, u.owner) && city.owner !== partner) {
        if (!(opt.final && captureOk(S, u, city))) return false;
        capturing = true;
      }
    }
    if (!opt.ignoreUnits) {
      // another nation's units block the tile for units of the same kind (land units for land units, ships for
      // ships), so a soldier on a bridge does not stop a ship sailing beneath it
      const isShip = (x) => U[x.type].cls === 'ship';
      let hostile = unitsAt(S, to).filter((x) => !friendly(S, x.owner, u.owner) && x.owner !== partner && isShip(x) === isShip(u));
      if (city && !city.hp && capturing) hostile = hostile.filter((x) => U[x.type].role === 'combat' && U[x.type].cls === 'land'); // docked ships and logistics units never stop a capture
      if (hostile.length) return false;
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
    const m = S.map, mv = supplyMoveLimit(S, u, moveOf(S, u)), prev = new Map([[u.t, -1]]);
    let frontier = [u.t];
    for (let d = 0; d < mv; d++) {
      const next = [];
      for (const t of frontier) for (const j of nbrs(m, t)) {
        if (prev.has(j)) continue;
        if (!canEnter(S, u, j, { final: true })) continue;
        prev.set(j, t);
        const c = cityAt(S, j);
        if (c && !friendly(S, c.owner, u.owner)) continue; // capture tile: may end there, not pass through
        if (fording(S, u, j)) continue; // wading into a river uses up the rest of the move
        if (u.type === 'tank' && S.map.tiles[j].trap != null) continue; // so does driving onto a tank trap
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

  // A land unit standing in (or wading into) a river with no bridge
  const fording = (S, u, t) => U[u.type].cls !== 'ship' && S.map.tiles[t].type === 'river' && !S.map.tiles[t].bridge;
  const inRiver = (S, u) => u.carriedBy == null && fording(S, u, u.t);
  /* ---------------- war: mobilization, doctrines, pay, strength ---------------- */
  const landCombat = (u) => U[u.type].role === 'combat' && U[u.type].cls === 'land';
  const mobOf = (S, pid) => (S.players[pid] && S.players[pid].mob) || 'peace';
  const doctrineOf = (S, pid, group) => (S.players[pid] && S.players[pid].doctrine && S.players[pid].doctrine[group]) || null;
  const MECH = ['tank', 'artillery', 'train', 'supplyTruck'];
  /* ---------------- unit designs ----------------
     A design is a named variant of a unit type with steps on HP, speed, damage (combat) and cargo (logistics). */
  const designById = (S, id) => (id == null ? null : (S.designs || []).find((d) => d.id === Number(id)) || null);
  const designOf = (S, u) => designById(S, u.design);
  // The stats of unit type `type` built to design `dz` (or the base model when dz is null)
  function ustat(type, dz) {
    const base = U[type], DS = R.DESIGN;
    if (!dz) return base;
    const st = dz.steps || {}, v = (k) => Number(st[k]) || 0;
    const factor = (table) => { let f = 1; for (const k of Object.keys(DS.ranges)) { const x = v(k), [up, down] = table[k]; f += x > 0 ? up * x : down * x; } return Math.max(0.3, f); };
    const fb = factor(DS.build), fi = factor(DS.idle), ft = factor(DS.perTile);
    const scale = (o, f) => { const r = {}; for (const [g, x] of Object.entries(o || {})) r[g] = round1(x * f); return r; };
    const cost = {}; for (const [g, x] of Object.entries(base.cost)) cost[g] = Math.max(0, Math.ceil(x * fb - 1e-9));
    const dm = v('dmg');
    return Object.assign({}, base, {
      name: dz.name,
      hp: Math.max(1, round1(base.hp * (1 + DS.hpStep * v('hp')))),
      move: Math.max(1, rawMove(type, st)),
      ammo: !base.ammo ? base.ammo : dm > 0 ? Math.ceil(base.ammo * (1 + DS.ammoUp * dm) - 1e-9) : Math.max(0.1, round1(base.ammo * (1 + DS.ammoDown * dm))),
      cargo: base.cargo ? Math.max(1, Math.floor(base.cargo * (1 + DS.cargoStep * v('cargo')) + 1e-9)) : base.cargo,
      idle: scale(base.idle, fi), perTile: scale(base.perTile, ft),
      cost, dmgMod: DS.dmgStep * dm, designId: dz.id,
    });
  }
  // Move before the floor of 1: + HP and + cargo slow a unit, - cargo speeds it up, - HP does not change speed
  function rawMove(type, st) { const v = (k) => Number((st || {})[k]) || 0; return U[type].move + v('speed') - Math.max(0, v('hp')) - v('cargo'); }
  const UU = (S, u) => ustat(u.type, designOf(S, u));
  const canUseDesign = (S, pid, dz) => !!dz && (dz.owner === pid || ((S.players[pid] || {}).designBlueprints || []).includes(dz.id));
  // Who may see a design's hidden stats (speed, upkeep, ammo, cargo, costs): its maker and blueprint holders
  const seesDesign = canUseDesign;
  // Did this nation research the unit's own building itself (or is it free from the start)?
  function researchedUnitSelf(S, pid, type) { const k = U[type] && U[type].unlock; return !!k && (!B[k].sci || S.players[pid].researched.includes(k)); }
  function checkDesign(S, pid, o) {
    const d = U[o.base], DS = R.DESIGN, p = S.players[pid];
    if (!d) return 'Unknown unit';
    if (!researchedUnitSelf(S, pid, o.base)) return `Only a nation that researched the ${B[d.unlock].name.toLowerCase()} itself can design ${d.name.toLowerCase()} variants`;
    const name = String(o.name || '').trim();
    if (!name || name.length > 30) return 'Give the design a name (up to 30 characters)';
    if ((S.designs || []).some((x) => x.owner === pid && x.name.toLowerCase() === name.toLowerCase())) return 'You already have a design with that name';
    const st = o.steps || {};
    for (const [k, [lo, hi]] of Object.entries(DS.ranges)) {
      const x = Number(st[k] || 0);
      if (!Number.isInteger(x) || x < lo || x > hi) return `${k} must be a whole number from ${lo} to ${hi}`;
      if (x && k === 'dmg' && d.role !== 'combat') return 'Only combat units have a damage setting';
      if (x && k === 'cargo' && !d.cargo) return 'Only logistics units have a cargo setting';
    }
    if (!Object.values(DS.ranges).some((_, i) => Number(st[Object.keys(DS.ranges)[i]] || 0))) return 'Change at least one setting from the base model';
    // every step must have its full effect: no floor may cancel it
    if (rawMove(o.base, st) < 1) return 'Move would fall below 1: add speed, or use fewer HP or cargo steps';
    if (Number(st.hp || 0) < 0 && d.hp * (1 + DS.hpStep * Number(st.hp)) < 1 - 1e-9) return `A ${d.name.toLowerCase()}'s HP cannot go that low`;
    if (Number(st.cargo || 0) < 0 && Math.floor(d.cargo * (1 + DS.cargoStep * Number(st.cargo)) + 1e-9) < 1) return 'Cargo cannot go that low';
    if (p.science < DS.sci) return `Needs ${DS.sci} science`;
    return null;
  }
  // Max HP: Quantity -20%, Quality +20% for land combat units
  function maxHpU(S, u) {
    let hp = UU(S, u).hp;
    if (landCombat(u)) { const a = doctrineOf(S, u.owner, 'army'); if (a === 'quantity') hp *= 0.8; if (a === 'quality') hp *= 1.2; }
    return round1(hp);
  }
  // Cargo and carrying space (Convoys: logistics ships +25% cargo, +1 unit)
  function cargoCap(S, u) {
    const d = UU(S, u);
    if (!d.cargo) return 0;
    return d.cls === 'ship' && doctrineOf(S, u.owner, 'naval') === 'convoys' ? Math.round(d.cargo * 1.25) : d.cargo;
  }
  function carryCap(S, u) {
    const d = U[u.type];
    if (!d.carry) return 0;
    return d.carry + (d.cls === 'ship' && d.role === 'logistic' && doctrineOf(S, u.owner, 'naval') === 'convoys' ? 1 : 0);
  }
  // Keep cargo space and HP in line with the owner's doctrines
  function refreshTraits(S) {
    for (const u of S.units) {
      if (U[u.type].cargo) u.cargoCap = cargoCap(S, u);
      const mx = maxHpU(S, u);
      if (u.hp > mx) u.hp = mx;
    }
  }
  // Can this unit attack or move by order this turn?
  function canAct(S, u) {
    if (U[u.type].role !== 'combat') return true;
    if (landCombat(u) && mobOf(S, u.owner) === 'peace') return false;
    if (u.paid === false && u.supplied === false) return false;
    return true;
  }
  function whyIdle(S, u) {
    if (landCombat(u) && mobOf(S, u.owner) === 'peace') return 'your army is at peacetime mobilization';
    if (u.paid === false && u.supplied === false) return 'it was neither paid nor supplied last turn';
    return null;
  }
  // Tiles a unit may move by order this turn (before supply limits)
  function moveOf(S, u) {
    const d = UU(S, u);
    let m = d.move;
    if (MECH.includes(u.type) && doctrineOf(S, u.owner, 'warfare') === 'mobileWarfare' && mobOf(S, u.owner) === 'full') m += 1;
    if (!canAct(S, u)) return 0;
    if (landCombat(u) && mobOf(S, u.owner) === 'partial') m = Math.max(1, Math.floor(m * R.MOBILIZE.partialSpeed));
    return m;
  }
  // Repairing n HP costs half of the unit's build cost in proportion to the HP restored (goods and manpower, one decimal)
  function repairCost(S, u, n) {
    const d = UU(S, u), share = (n / maxHpU(S, u)) * R.DESIGN.repairShare, goods = {};
    for (const [g, x] of Object.entries(d.cost)) if (g !== 'mp') { const v = round1(x * share); if (v > 0) goods[g] = v; }
    return { goods, mp: round1((d.cost.mp || 0) * share) };
  }
  const roundGoods = (o) => { const r = {}; for (const [g, v] of Object.entries(o)) { const w = Math.max(1, Math.round(v)); r[g] = w; } return r; };
  // Credits per turn for a combat unit (before free berths)
  function payOf(S, u) {
    const d = U[u.type];
    if (d.role !== 'combat') return 0;
    if (d.cls === 'ship') return R.PAY.ship[u.type] != null ? R.PAY.ship[u.type] : R.PAY.shipDefault;
    const table = R.PAY[doctrineOf(S, u.owner, 'army') || 'standard'] || R.PAY.standard;
    return Math.round(table[mobOf(S, u.owner)] * (govOf(S, u.owner).landPay || 1));
  }
  const stars = (u) => ((u.xp || 0) >= R.XP.elite ? 2 : (u.xp || 0) >= R.XP.veteran ? 1 : 0);
  // Entrenchment level 0-5: infantry of a nation with the Entrenchment doctrine at full mobilization gains a level
  // for each turn in a row it does not move (u.dig, counted at the end of each turn). A move order this turn cancels it.
  function entrenchLevel(S, u, moving) {
    if (u.type !== 'infantry' || u.carriedBy != null) return 0;
    if (doctrineOf(S, u.owner, 'warfare') !== 'entrenchment' || mobOf(S, u.owner) !== 'full') return 0;
    if (moving && moving.has(u.id)) return 0;
    return Math.min(R.ENTRENCH.max, u.dig || 0);
  }
  const entrenched = (S, u, moving) => entrenchLevel(S, u, moving) > 0;
  // Mobile warfare: tanks and artillery that moved last turn, at full mobilization
  const blitzing = (S, u) => (u.type === 'tank' || u.type === 'artillery') && doctrineOf(S, u.owner, 'warfare') === 'mobileWarfare' && mobOf(S, u.owner) === 'full' && u.lastMoveTurn === S.turn - 1;
  const isShip = (type) => U[type] && U[type].cls === 'ship';
  /* Combat modifiers. All that apply (attacker's and target's) are summed: damage = base x (1 + sum), sum >= floor.
     att: { unit } or { weapon, owner };  tgt: { unit } or { city };  opts.counter = a defender striking back */
  function attackMods(S, att, tgt, opts = {}) {
    const mods = [], add = (label, v) => mods.push({ label, v });
    const u = att.unit, tu = tgt.unit;
    if (u) {
      const d = U[u.type];
      if (!opts.counter && landCombat(u) && mobOf(S, u.owner) === 'partial') add('Partial mobilization', R.MOBILIZE.partialDamage);
      if (u.paid === false && u.supplied === false) { if (opts.counter) add('Unpaid and unsupplied', R.MODS.helplessCounter); }
      else if (u.paid === false) add('Unpaid', R.MODS.unpaid);
      else if (u.supplied === false) add('Out of supply', R.MODS.unsupplied);
      const st = stars(u); if (st) add(R.XP.names[st], R.XP.bonus[st]);
      const dz = designOf(S, u); if (dz && dz.steps && Number(dz.steps.dmg)) add(`${dz.name} design`, R.DESIGN.dmgStep * Number(dz.steps.dmg));
      if (landCombat(u) && doctrineOf(S, u.owner, 'army') === 'quality') add('Quality doctrine', R.QUALITY_DAMAGE);
      if (d.cls === 'ship') {
        const nav = doctrineOf(S, u.owner, 'naval');
        if (nav === 'convoys' && unitsAt(S, u.t).some((x) => x.owner === u.owner && U[x.type].cls === 'ship' && U[x.type].role === 'logistic')) add('Convoy escort', 0.25);
        if (nav === 'navalWarfare' && tu && isShip(tu.type)) add('Naval warfare', 0.5);
        if (nav === 'bombardment' && (tgt.city || (tu && !isShip(tu.type)))) add('Naval bombardment', 0.75);
      }
      if (blitzing(S, u)) add('Mobile warfare', 0.25);
      if (entrenched(S, u, opts.moving)) { if (tu && tu.type === 'cavalry') add('Entrenched vs cavalry', R.ENTRENCH.vsCavalry); else add('Firing from trenches', R.ENTRENCH.fire); }
    }
    const lvl = tu ? entrenchLevel(S, tu, opts.moving) : 0;
    if (lvl) {
      const k = u ? u.type : att.weapon;
      if (k === 'tank') add('Tanks vs trenches', R.ENTRENCH.tankBonus);
      else add(`Target entrenched (level ${lvl})`, -R.ENTRENCH.perLevel * lvl);
    }

    const total = Math.max(R.MODS.floor, mods.reduce((a, m) => a + m.v, 0));
    return { mods, total };
  }
  // Base damage of attacker type k on a unit; a land unit hits ships docked in a fallen city (0 HP) with its city damage
  function baseDamage(S, k, tu) {
    const d = R.dmg(k, tu.type);
    if (d > 0) return d;
    if (U[k] && U[k].cls === 'land' && U[tu.type].cls === 'ship') { const c = cityAt(S, tu.t); if (c && c.hp <= 0) return R.dmg(k, 'city'); }
    return d;
  }
  function attackDamage(S, att, tgt, opts = {}) {
    const k = att.unit ? att.unit.type : att.weapon;
    let base = tgt.city ? R.dmg(k, 'city') : baseDamage(S, k, tgt.unit);
    if (opts.counter) base = base / 2;
    if (base <= 0) return { base: 0, dmg: 0, mods: [], total: 0 };
    const m = attackMods(S, att, tgt, opts);
    return { base, dmg: round1(base * (1 + m.total)), mods: m.mods, total: m.total };
  }
  // For the interface: what attacking tile t would do
  function previewAttack(S, u, t) {
    const tgt = pickTarget(S, u.type, u.owner, t);
    if (!tgt) return null;
    const r = attackDamage(S, { unit: u }, tgt);
    const name = tgt.city ? tgt.city.name : unitName(tgt.unit);
    let back = null;
    if (tgt.unit && dist(S.map, u.t, t) <= 1) back = attackDamage(S, { unit: tgt.unit }, { unit: u }, { counter: true });
    return Object.assign(r, { target: name, back });
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
    const cap = carryCap(S, tr);
    if (!cap || tr.carriedBy != null) return 'it cannot carry units';
    if (U[u.type].cls !== 'land' && U[u.type].cls !== 'rail') return 'only land units can board';
    if (u.type === 'train' || (U[u.type].cls === 'rail')) return 'trains cannot be carried';
    if (td.carryTypes && !td.carryTypes[u.type]) return `it only carries ${Object.keys(td.carryTypes).map((k) => U[k].name.toLowerCase()).join(' or ')}`;
    if (U[u.type].carry && carried(S, u).length) return 'a loaded transport cannot board';
    const used = carried(S, tr).reduce((a, x) => a + carrySlots(tr, x), 0);
    if (used + carrySlots(tr, u) > cap) return 'it is full';
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
    const combat = foes.filter((x) => U[x.type].role === 'combat' && baseDamage(S, attKey, x) > 0);
    // a land garrison is hit before ships docked in the same city
    combat.sort((a, b) => (U[a.type].cls === 'ship') - (U[b.type].cls === 'ship'));
    if (combat.length) return { unit: combat[0] };
    const others = foes.filter((x) => baseDamage(S, attKey, x) > 0);
    if (others.length) return { unit: others[0] };
    // an undefended city at 0 HP can still be shelled, which stops it healing that turn
    if (city && !friendly(S, city.owner, attOwner) && atWar(S, attOwner, city.owner) && R.dmg(attKey, 'city') > 0) return { city };
    return null;
  }
  function attackTargets(S, u) {
    const d = U[u.type];
    if (d.role !== 'combat' || u.carriedBy != null || inRiver(S, u) || !canAct(S, u)) return [];
    return within(S.map, u.t, d.range).filter((t) => t !== u.t && pickTarget(S, u.type, u.owner, t));
  }
  function cityWeaponTargets(S, c, w) {
    if (!countB(S, c.id, w)) return [];
    return within(S.map, c.t, R.WEAPON_RANGE).filter((t) => { const p = pickTarget(S, w, c.owner, t); return p && p.unit; });
  }

  /* ---------------- supply ---------------- */
  // Where a unit draws supply from, in order: your cities in range, then field depots, then nearby logistics
  // units (and the transport carrying it), and only then its own cargo or stores.
  function supplySources(S, u) {
    const d = U[u.type], res = [], pos = posOf(S, u);
    const cities = citiesOf(S, u.owner).map((c) => ({ c, dd: dist(S.map, c.t, pos) })).sort((a, b) => a.dd - b.dd);
    for (const { c, dd } of cities) {
      if (d.cls === 'ship') { if (portOk(S, c, u) && dd <= R.CITY.portRadius) res.push({ kind: 'city', ref: c }); }
      else if (dd <= supplyRadius(S, c)) res.push({ kind: 'city', ref: c });
    }
    if (d.cls !== 'ship') {
      for (const dp of fieldDepots(S).map((x) => ({ x, dd: dist(S.map, x.t, pos) })).sort((a, b) => a.dd - b.dd)) if (dp.x.owner === u.owner && dp.dd <= R.DEPOT.supplyRange) res.push({ kind: 'depot', ref: dp.x });
      const near = [];
      for (const x of S.units) {
        if (x === u || x.owner !== u.owner || x.carriedBy != null || x.id === u.carriedBy) continue;
        const mobile = x.type === 'caravan' || x.type === 'supplyTruck' || (x.type === 'train' && x.route == null);
        const dd = dist(S.map, x.t, pos);
        if (mobile && dd <= R.CITY.unitSupplyRadius) near.push({ x, dd });
      }
      for (const n of near.sort((a, b) => a.dd - b.dd || a.x.id - b.x.id)) res.push({ kind: 'unit', ref: n.x });
    } else {
      // ships draw from your freighters and merchantmen within 2 tiles, like land units from caravans and trucks
      const near = [];
      for (const x of S.units) {
        if (x === u || x.owner !== u.owner || x.carriedBy != null) continue;
        if (U[x.type].cls !== 'ship' || U[x.type].role !== 'logistic') continue;
        const dd = dist(S.map, x.t, pos);
        if (dd <= R.CITY.unitSupplyRadius) near.push({ x, dd });
      }
      for (const n of near.sort((a, b) => a.dd - b.dd || a.x.id - b.x.id)) res.push({ kind: 'unit', ref: n.x });
    }
    if (u.carriedBy != null) { const tr = unitById(S, u.carriedBy); if (tr) res.push({ kind: 'unit', ref: tr }); }
    if (d.cargo) res.push({ kind: 'unit', ref: u });
    if (d.role === 'combat') { u.store = u.store || {}; res.push({ kind: 'store', ref: u }); }
    return res;
  }
  // How much a combat unit carries for itself: two turns at full speed and two attacks' ammo
  function storeCap(S, u) {
    const d = UU(S, u);
    if (d.role !== 'combat') return {};
    let mv = d.move;
    if (MECH.includes(u.type) && doctrineOf(S, u.owner, 'warfare') === 'mobileWarfare') mv += 1;
    const cap = {};
    for (const [g, x] of Object.entries(d.idle || {})) cap[g] = (cap[g] || 0) + x;
    for (const [g, x] of Object.entries(d.perTile || {})) { const raw = x * mv; cap[g] = (cap[g] || 0) + (d.perTileRound === 'up' ? Math.ceil(raw - 1e-9) : Math.floor(raw + 1e-9)); }
    for (const g of Object.keys(cap)) cap[g] = round1(cap[g] * R.UNIT_STORE.turns);
    if (d.ammo) cap.ammo = d.ammo * R.UNIT_STORE.attacks;
    return cap;
  }
  const stockRef = (src) => (src.kind === 'unit' ? src.ref.cargo : src.kind === 'store' ? (src.ref.store = src.ref.store || {}) : src.ref.stock);
  const sourceName = (src) => (src.kind === 'city' ? src.ref.name : src.kind === 'depot' ? `Field depot #${src.ref.id}` : src.kind === 'store' ? 'its own stores' : unitName(src.ref));
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
    if (commit && ok) for (const [st, g, take] of plan) st[g] = round1(st[g] - take);
    return { ok, missing, used: [...new Set(plan.map((p) => p[3]))] };
  }
  function inBase(S, u) {
    const d = U[u.type], c = cityAt(S, posOf(S, u));
    if (!c || c.owner !== u.owner || u.carriedBy != null) return false;
    if (d.cls === 'ship') return portOk(S, c, u);
    return countB(S, c.id, 'barracks') > 0;
  }
  // Supply a unit needs this turn. Land combat units at peace: idle food only and no movement.
  // Quantity doctrine halves idle supply. opts.anywhere = ignore the in-base exemption (for movement checks).
  function upkeepOf(S, u, moved, opts = {}) {
    if (!opts.anywhere && inBase(S, u)) return {};
    const d = UU(S, u);
    let need = Object.assign({}, d.idle);
    if (landCombat(u)) {
      if (mobOf(S, u.owner) === 'peace') { need = d.idle.food ? { food: d.idle.food } : {}; moved = 0; }
      if (doctrineOf(S, u.owner, 'army') === 'quantity') for (const g of Object.keys(need)) need[g] = round1(need[g] / 2);
    }
    for (const [g, x] of Object.entries(d.perTile)) {
      const raw = x * (moved || 0), v = d.perTileRound === 'up' ? Math.ceil(raw - 1e-9) : Math.floor(raw + 1e-9);
      if (v) need[g] = round1((need[g] || 0) + v);
    }
    return need;
  }
  // How many tiles a unit's supply lets it move this turn (it needs its idle supply plus the per-tile cost)
  function supplyMoveLimit(S, u, want) {
    const src = supplySources(S, u);
    for (let k = want; k > 0; k--) if (drawGoods(src, upkeepOf(S, u, k, { anywhere: true }), false).ok) return k;
    return 0;
  }

  /* ---------------- validation shared by UI and engine ---------------- */
  // Who supplies an infrastructure build: a city within its supply range of the tile, or a land
  // logistics unit (caravan, supply truck, train) within its supply range that carries the goods.
  function infraBuilderError(S, pid, o) {
    const t = o.t;
    if (o.unit != null) {
      const u = unitById(S, o.unit);
      if (!u || u.owner !== pid) return 'Not your unit';
      const ud = U[u.type];
      if (ud.role !== 'logistic' || ud.cls === 'ship' || !ud.cargo) return 'Only caravans, supply trucks and trains can build in the field';
      if (u.carriedBy != null) return 'Unload it first';
      if (dist(S.map, u.t, t) > R.CITY.unitSupplyRadius) return `Must be within ${R.CITY.unitSupplyRadius} tiles of the ${ud.name.toLowerCase()}`;
      return null;
    }
    const c = cityById(S, o.city);
    if (!c || c.owner !== pid) return 'Not your city';
    if (dist(S.map, c.t, t) > supplyRadius(S, c)) return `Outside ${c.name}'s supply range (${supplyRadius(S, c)} tiles); bring the goods with a caravan, supply truck or train`;
    return null;
  }
  function checkBuild(S, pid, o) {
    const c = cityById(S, o.city), d = B[o.key];
    if (!d) return 'Unknown building';
    if ((d.place === 'infra' || d.place === 'depot') && o.unit != null) { if (!isUnlocked(S, pid, o.key)) return 'Not researched yet'; }
    else if (!c || c.owner !== pid) return 'Not your city';
    if (!isUnlocked(S, pid, o.key)) return 'Not researched yet';
    if (d.place === 'city') {
      if (d.limit && countB(S, c.id, o.key) >= d.limit) return `Only ${d.limit} per city`;
      if (d.needsWater && !nearWater(S, c.t)) return 'City must be next to water';
      return null;
    }
    const t = o.t;
    if (t == null || t < 0 || t >= S.map.tiles.length) return 'Pick a tile';
    const tile = S.map.tiles[t];
    if (o.key === 'tankTrap') {
      // built by a city on any land tile in its supply range that has no building, field depot or settlement
      if (!isLand(S, t)) return 'Land tiles only';
      if (cityAt(S, t)) return 'Not on a city tile';
      const own = tileOwner(S, t);
      if (own != null && !friendly(S, own, pid)) return "Inside another nation's territory";
      if (dist(S.map, c.t, t) > supplyRadius(S, c)) return `Outside ${c.name}'s supply range (${supplyRadius(S, c)} tiles)`;
      if (tile.trap != null) return 'Tile already has a tank trap';
      if (tileBuilding(S, t)) return 'Tile has a building';
      if (depotAt(S, t)) return 'There is a field depot or settlement here';
      return null;
    }
    if (d.place === 'tile') {
      if (tile.owner !== c.id) return "Tile must be in this city's territory";
      if (cityAt(S, t)) return 'Not on the city tile';
      if (tile.trap != null) return 'Tile has a tank trap';
      if (tileBuilding(S, t)) return 'Tile already has a building';
      if (depotAt(S, t)) return 'There is a field depot here';
      if (!d.tiles.includes(tile.type)) return `Needs ${d.tiles.map((x) => TT[x].name.toLowerCase()).join(' or ')}`;
      if (o.key === 'fishery' && tile.bridge) return 'Not on a bridged tile';
      return null;
    }
    // infrastructure and field depots
    const own = tileOwner(S, t);
    if (own != null && !friendly(S, own, pid)) return "Inside another nation's territory";
    const who = infraBuilderError(S, pid, o);
    if (who) return who;
    if (o.key === 'settlement') {
      if (own != null) return "Settlements go outside every city's territory";
      if (!R.SETTLEMENT.tiles.includes(tile.type)) return 'Settlements go on grassland or forest';
      if (cityAt(S, t)) return 'Not on a city tile';
      if (tileBuilding(S, t)) return 'Tile already has a building';
      if (depotAt(S, t)) return 'There is already a settlement or field depot here';
      if (tile.trap != null) return 'Tile has a tank trap';
      return null;
    }
    if (d.place === 'depot') {
      if (terrain(S, t) !== 'land') return 'Field depots go on land';
      if (cityAt(S, t)) return 'Not on a city tile';
      if (tileBuilding(S, t)) return 'Tile already has a building';
      if (depotAt(S, t)) return 'There is already a field depot here';
      if (tile.trap != null) return 'Tile has a tank trap';
      return null;
    }
    if (o.key === 'railTunnel') {
      if (tile.type !== 'mountain') return 'Rail tunnels go through mountains';
      if (own !== pid) return "Only inside one of your cities' territory";
      if (tile.tunnel != null) return 'Already has a rail tunnel';
      return null;
    }
    if (o.key === 'railroad') {
      if (tile.rail != null) return 'Already has a railroad';
      if (terrain(S, t) === 'mountain') return 'Mountains are impassable';
      if (isWater(S, t)) return 'Use a rail bridge to cross water';
      if (cityAt(S, t)) return 'Cities already act as rail stations';
      return null;
    }
    if (o.key === 'bridge' || o.key === 'railBridge') {
      const why = bridgeSiteError(S, t);
      if (why) return why;
      if (o.key === 'bridge' && tile.bridge) return 'Already bridged';
      if (o.key === 'railBridge' && tile.bridge === 'rail') return 'Already has a rail bridge';
      if (tileBuilding(S, t)) return 'Not on a tile with a fishery';
      return null;
    }
    return 'Cannot build here';
  }
  // Bridges go on water next to land. River and lake tiles need one land neighbour; an ocean tile needs at least
  // 3 land neighbours, or land on two opposite sides. Only real land counts (mountains yes, other bridges no).
  function bridgeSiteError(S, t) {
    const tile = S.map.tiles[t];
    if (!['river', 'lake', 'ocean'].includes(tile.type)) return 'Bridges go on water';
    const around = dirs(S.map, t).map((j) => j >= 0 && TT[S.map.tiles[j].type].terrain !== 'water');
    const n = around.filter(Boolean).length;
    if (tile.type !== 'ocean') return n >= 1 ? null : 'A bridge must touch land';
    if (n >= 3 || [0, 1, 2].some((i) => around[i] && around[i + 3])) return null;
    return 'An ocean bridge needs land on 3 sides, or on two opposite sides';
  }
  function checkTrain(S, pid, cityId, type, designId) {
    const c = cityById(S, cityId), d = U[type];
    if (!d) return 'Unknown unit';
    if (!c || c.owner !== pid) return 'Not your city';
    if (!unitUnlocked(S, pid, type)) return `Research ${B[d.unlock].name} first`;
    if (designId != null) {
      const dz = designById(S, designId);
      if (!dz || dz.base !== type) return 'Unknown design';
      if (!canUseDesign(S, pid, dz)) return `You do not have the ${dz.name} blueprint`;
      if ((S.players[pid].retiredDesigns || []).includes(dz.id)) return `${dz.name} is retired`;
    }
    if (!d.builtAt.some((k) => countB(S, c.id, k))) return `Needs a ${d.builtAt.map((k) => B[k].name.toLowerCase()).join(' or ')}`;
    return null;
  }
  // Founding a city: a full settlement of yours becomes a city. Orders: { depot: settlementId, name }
  function checkFound(S, pid, depotId) {
    const dp = depotById(S, Number(depotId));
    if (!dp || dp.owner !== pid || !isSettlement(dp)) return 'Not your settlement';
    if (S.map.tiles[dp.t].owner != null) return "The site is now inside a city's territory";
    if (cityAt(S, dp.t)) return 'There is already a city here';
    const need = settlementNeeds(S, dp), short = {};
    for (const [g, v] of Object.entries(need)) if ((dp.stock[g] || 0) < v) short[g] = round1(v - (dp.stock[g] || 0));
    if (Object.keys(short).length) return `The settlement still needs ${goodsText(short)}`;
    const mp = foundMpOf(S, pid) + (S.map.tiles[dp.t].type === 'forest' ? R.CLEAR_FOREST.mp : 0);
    if (S.players[pid].manpower < mp) return `Needs ${mp} manpower`;
    return null;
  }
  // Demolish orders: { t, what: 'building' | 'trap' | 'rail' | 'bridge' }
  function demolishable(S, pid, t) {
    const tile = S.map.tiles[t], own = tileOwnerCity(S, t), list = [];
    if (cityAt(S, t)) return list;
    const dp = depotAt(S, t);
    if (dp && dp.owner === pid) list.push('depot');
    if (tile.tunnel === pid) list.push('tunnel');
    const mine = own ? own.owner === pid : null; // null = unclaimed
    if (mine === false) return list;
    if (mine && tileBuilding(S, t)) list.push('building');
    if (tile.trap === pid) list.push('trap');
    if (tile.rail != null && tile.bridge !== 'rail' && tile.tunnel == null && (mine || tile.rail === pid)) list.push('rail');
    if (tile.bridge && (mine || tile.bridgeBy === pid)) list.push('bridge');
    return list;
  }
  function checkDisband(S, pid, o) {
    const u = unitById(S, o.unit);
    if (!u || u.owner !== pid) return 'not your unit';
    if (carried(S, u).length) return 'unload the units it carries first';
    return null;
  }
  function checkDemolish(S, pid, o) {
    if (o.what === 'city') {
      const b = S.buildings.find((x) => x.id === Number(o.id));
      if (!b || B[b.key].place !== 'city' || buildingOwner(S, b) !== pid) return 'Nothing of yours to demolish there';
      return null;
    }
    const t = Number(o.t);
    if (!(t >= 0 && t < S.map.tiles.length)) return 'No such tile';
    if (!demolishable(S, pid, t).includes(o.what)) return 'Nothing of yours to demolish there';
    const tile = S.map.tiles[t], here = S.units.filter((u) => u.t === t);
    if (o.what === 'bridge' && here.some((u) => U[u.type].cls !== 'ship')) return 'Units are standing on the bridge';
    if (o.what === 'tunnel' && here.length) return 'Units are in the tunnel';
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
  // Sabotage orders: { unit, t } — a ready land combat unit wrecks the railroad, bridge or rail bridge on its
  // own tile or next to it, outside every nation's territory, built by a nation it is at war with.
  function sabotageTarget(S, t) {
    const tile = S.map.tiles[t];
    if (tile && tile.tunnel != null) return { what: 'railTunnel', owner: tile.tunnel }; // tunnels can be hit even inside a nation's territory
    if (!tile || cityAt(S, t) || tileOwner(S, t) != null) return null;
    if (tile.bridge) return { what: tile.bridge === 'rail' ? 'railBridge' : 'bridge', owner: tile.bridgeBy };
    if (tile.rail != null) return { what: 'railroad', owner: tile.rail };
    return null;
  }
  // Warships and frigates can destroy any bridge or rail bridge on or next to their tile, anywhere, if at war with its owner
  function shipSabotageTarget(S, t) {
    const tile = S.map.tiles[t];
    if (!tile || !tile.bridge) return null;
    return { what: tile.bridge === 'rail' ? 'railBridge' : 'bridge', owner: tile.bridgeBy };
  }
  function sabotageTargetFor(S, u, t) {
    if (U[u.type].cls === 'ship') return shipSabotageTarget(S, t);
    const tile = S.map.tiles[t];
    if (u.type === 'infantry' && tile && tile.trap != null) return { what: 'tankTrap', owner: tile.trap }; // infantry can clear tank traps anywhere
    return sabotageTarget(S, t);
  }
  function checkSabotage(S, pid, o) {
    const u = unitById(S, o.unit), t = Number(o.t);
    if (!u || u.owner !== pid) return 'Not your unit';
    const d = U[u.type];
    if (d.role === 'combat' && d.cls === 'ship') {
      if (!canAct(S, u)) return `It cannot act: ${whyIdle(S, u)}`;
      if (!(t >= 0 && t < S.map.tiles.length) || dist(S.map, u.t, t) > 1) return 'Must be on or next to the bridge';
      const tg = shipSabotageTarget(S, t);
      if (!tg) return 'No bridge there';
      if (tg.owner == null || !atWar(S, pid, tg.owner)) return 'You can only destroy the bridges of a nation you are at war with';
      if (S.units.some((x) => x.t === t && x.carriedBy == null && U[x.type].cls !== 'ship')) return 'Units are on the bridge';
      return null;
    }
    if (d.role !== 'combat' || d.cls !== 'land') return 'Only combat units can sabotage';
    if (u.carriedBy != null) return 'Unload it first';
    if (!canAct(S, u)) return `It cannot act: ${whyIdle(S, u)}`;
    if (!(t >= 0 && t < S.map.tiles.length) || dist(S.map, u.t, t) > 1) return 'Must be on or next to the target';
    const tg = sabotageTargetFor(S, u, t);
    if (!tg) return 'Nothing to destroy there outside every nation\'s territory';
    if (tg.owner == null || !atWar(S, pid, tg.owner)) return 'You can only sabotage the works of a nation you are at war with';
    if (tg.what !== 'railroad' && tg.what !== 'tankTrap') {
      if (t === u.t) return 'Stand next to the bridge, not on it';
      if (S.units.some((x) => x.t === t && x.carriedBy == null && U[x.type].cls !== 'ship')) return 'Units are on the bridge';
    }
    return null;
  }
  const PEACE_PART = () => ({ credits: 0, science: 0, cities: [], tiles: [], units: [] });
  function normPeace(pl) {
    const out = { term: Math.round(Number(pl && pl.term) || R.PEACE.minTerm), give: PEACE_PART(), get: PEACE_PART() };
    for (const side of ['give', 'get']) {
      const x = (pl && pl[side]) || {};
      out[side].credits = Math.max(0, Math.floor(Number(x.credits) || 0));
      out[side].science = Math.max(0, Math.floor(Number(x.science) || 0));
      out[side].cities = [...new Set((x.cities || []).map(Number))];
      out[side].tiles = [...new Set((x.tiles || []).map(Number))];
      out[side].units = [...new Set((x.units || []).map(Number))];
      const rp = x.reparations || {};
      out[side].reparations = { amount: Math.max(0, Math.floor(Number(rp.amount) || 0)), turns: Math.max(1, Math.min(R.LOANS.intl.maxTerm, Math.floor(Number(rp.turns) || 12))) };
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
      const recv = pid === a ? b : a;
      if (part.reparations && part.reparations.amount && !atWar(S, a, b)) return 'reparations can only be part of a peace treaty that ends a war';
      if (part.units.length && atWar(S, a, b)) return 'units can only be given between nations at peace';
      for (const id of part.units) { const why = giftError(S, pid, recv, id); if (why) return why; }
    }
    return null;
  }
  // Lend-lease: a unit can be handed over when it stands in the receiver's territory
  // (a ship: in the territory of one of the receiver's cities that has a harbor or port).
  function giftError(S, from, to, id) {
    const u = unitById(S, id);
    if (!u || u.owner !== from) return `${S.players[from].name} no longer has unit #${id}`;
    if (u.carriedBy != null) return `${unitName(u)} is aboard a transport (give the transport instead)`;
    const oc = tileOwnerCity(S, u.t);
    if (!oc || oc.owner !== to) return `${unitName(u)} must be inside ${S.players[to].name}'s territory`;
    if (U[u.type].cls === 'ship' && !countB(S, oc.id, 'port') && !countB(S, oc.id, 'harbor')) return `${unitName(u)} must be in the waters of a ${S.players[to].name} city with a harbor or port`;
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
      if (part.units.length) bits.push(part.units.map((id) => { const u = unitById(S, id); return u ? unitName(u) : `unit #${id}`; }).join(', '));
      if (part.reparations && part.reparations.amount) bits.push(`${part.reparations.amount} credits in reparations over ${part.reparations.turns} turns`);
      if (bits.length) out.push(`${S.players[pid].name} gives ${bits.join(', ')}`);
    }
    return out.join('; ');
  }
  const routeDest = (S, r) => (r.to.type === 'city' ? cityById(S, r.to.id) : r.to.type === 'depot' ? depotById(S, r.to.id) : unitById(S, r.to.id));
  function routeEstimate(S, r) {
    const from = cityById(S, r.from);
    const to = routeDest(S, r);
    if (!from || !to) return { perTurn: 0, len: null, ok: false };
    const toT = to.t;
    let perTurn = 0, len = null, ok = r.transports.length > 0;
    for (const id of r.transports) {
      const u = unitById(S, id);
      if (!u) continue;
      const p = findPath(S, u, from.t, toT, { partner: r.partner, ignoreUnits: true, noFord: true });
      if (!p) { ok = false; continue; }
      len = p.length - 1;
      const ud = UU(S, u), rt = Math.max(1, Math.ceil((2 * len) / ud.move));
      perTurn += (ud.cargo || 0) / rt;
    }
    return { perTurn: perTurn >= 10 ? Math.floor(perTurn) : Math.round(perTurn * 10) / 10, len, ok };
  }
  function describeProposal(S, pr) {
    const p = pr.payload || {};
    if (pr.kind === 'peace') { const terms = peaceTerms(S, pr), term = normPeace(p).term; return `${term ? `a ${term}-turn peace treaty` : 'a treaty'}${terms ? ` (${terms})` : ''}`; }
    if (pr.kind === 'treaty') return p.type === 'alliance' ? 'a defensive alliance' : `a ${p.type} rights treaty`;
    if (pr.kind === 'blueprint' && p.design != null) { const dz = designById(S, p.design); return `the ${dz ? `${dz.name} design (${U[dz.base].name.toLowerCase()})` : 'unit design'} blueprint for ${p.price} credits`; }
    if (pr.kind === 'blueprint') return `the ${B[p.key] ? B[p.key].name : p.key} blueprint for ${p.price} credits`;
    if (pr.kind === 'route') return `a trade route (#${p.route})`;
    if (pr.kind === 'loan') return `a loan of ${p.amount} credits at ${p.rate}% a year over ${p.term} turns (${loanPayment(p.amount, p.rate, p.term)} a turn), ${p.lend ? `from ${S.players[pr.from].name} to ${S.players[pr.to].name}` : `from ${S.players[pr.to].name} to ${S.players[pr.from].name}`}`;
    return pr.kind;
  }

  // Agreement partners: an active peace treaty, a transit/port/rail treaty, or an accepted trade route
  // Can pid declare war on target right now? Autocracies, communists and provisional governments always may; a democracy
  // or monarchy may against a nation at war with one of its allies (a defensive alliance), or one that defaulted on
  // reparations owed to it; otherwise it must send an ultimatum.
  function checkDeclare(S, pid, target) {
    if (atWar(S, pid, target)) return 'already at war';
    // unpaid reparations: the nation owed may declare war at once, peace treaty or not
    if ((S.grievances || []).some((g) => g.from === pid && g.against === target)) return null;
    const pact = S.treaties.find((t) => t.type === 'peace' && pairs(t, pid, target));
    if (pact) return `your peace treaty is in force until turn ${pact.endsTurn}`;
    if (!govOf(S, pid).notice) return null; // provisional governments, autocracies and communists declare instantly
    for (const q of alliesOf(S, pid)) if (q !== target && atWar(S, target, q)) return null;
    const g = govOf(S, pid);
    return `a ${g.name.toLowerCase()} must send an ultimatum (${g.notice} turn${g.notice === 1 ? "'s" : "s'"} notice) unless ${S.players[target].name} is at war with one of your allies`;
  }
  function checkUltimatum(S, pid, target) {
    if (atWar(S, pid, target)) return 'already at war';
    const pact = S.treaties.find((t) => t.type === 'peace' && pairs(t, pid, target));
    if (pact) return `your peace treaty is in force until turn ${pact.endsTurn}`;
    if ((S.ultimatums || []).some((u) => u.from === pid && u.to === target)) return 'you already have an ultimatum waiting on them';
    return null;
  }
  function describeUltimatum(S, u) {
    const terms = peaceTerms(S, { from: u.from, to: u.to, payload: u.payload });
    return `${terms || 'no terms'}${u.note ? ` ("${u.note}")` : ''}`;
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
    if (list.length < 2 || list.length > R.PLAYERS.max) throw new Error(`The game needs between 2 and ${R.PLAYERS.max} players.`);
    const seed = opts.seed != null && opts.seed !== '' ? hashSeed(opts.seed) : (Math.floor(Math.random() * 4294967296) >>> 0);
    const rng = makeRng(seed);
    const { map, starts } = genMap(list.length, rng, { mapType: opts.mapType, tilesPerPlayer: opts.tilesPerPlayer });
    const start = startingResources(opts.start);
    const S = {
      version: 13, id: opts.id || `game-${seed.toString(36)}-${Date.now().toString(36)}`, name: opts.name || 'Guns, Pacts, and Commerce', start,
      seed, turn: 1, map, players: [], cities: [], units: [], buildings: [], routes: [], treaties: [], wars: [], proposals: [],
      market: { pool: {}, prices: {} }, reports: {}, nextId: 1, gameOver: null, history: [], depots: [], designs: [], ultimatums: [], loans: [], calls: [], grievances: [], news: [], firstResearched: {}, warNames: [], records: {}, pressIdx: { tip: 0, cls: 0 }, lastScoop: null,
      marketTrickle: R.MARKET.trickleChoices.includes(Number(opts.marketTrickle)) ? Number(opts.marketTrickle) : R.MARKET.trickle,
    };
    list.forEach((pl, i) => {
      S.players.push({
        id: i, name: pl.name || `Player ${i + 1}`, color: pl.color || R.PLAYER_COLORS[i % R.PLAYER_COLORS.length],
        credits: start.credits, manpower: start.manpower, science: 0, researched: [], blueprints: [], designBlueprints: [], retiredDesigns: [],
        eliminated: false, priority: R.DEFAULT_PRIORITY.slice(), endVote: false,
        mob: 'peace', mobPending: null, mobDown: null, doctrine: { naval: null, army: null, warfare: null }, doctrineSince: {}, supplyPriority: R.SUPPLY_PRIORITY.slice(),
        gov: 'provisional', govSince: null, tax: 'normal', taxSince: null, upheavalUntil: null, rally: false,
        queue: {}, keep: {}, keepCredits: 0, keepManpower: 0, cityOrder: [], recurring: [],
        loans: [], taxHistory: [], unrestUntil: null, unrestRate: 0, lastDomesticDefault: null, lastForeignDefault: null,
        hist: [], cum: { science: 0, value: 0 },
      });
      const c = foundCityAt(S, i, starts[i], pl.cityName || `${pl.name || 'Player ' + (i + 1)} Capital`);
      for (const g of Object.keys(start.stock)) c.stock[g] = Math.min(start.stock[g], capacity(S, c, g));
      S.reports[i] = [{ turn: 0, cat: 'game', msg: `${c.name} founded. Build extraction, a forge and a workshop to get your economy running.` }];
    });
    computePrices(S);
    return S;
  }


  /* =====================================================================
     STANDING ORDERS: building queues, minimum stocks, recurring market orders
     ===================================================================== */
  const queueable = (key) => !!B[key] && (B[key].place === 'city' || B[key].place === 'tile') && key !== 'tankTrap';
  const num0 = (v) => Math.max(0, Math.floor(Number(v) || 0));
  // the player's queue, cleaned: only their own cities, only buildings, at most QUEUE.perCity each
  function cleanQueue(S, pid, q) {
    const out = {};
    for (const [cid, list] of Object.entries(q || {})) {
      const c = cityById(S, Number(cid));
      if (!c || c.owner !== pid || !Array.isArray(list)) continue;
      const items = [];
      for (const it of list) {
        if (!it || !queueable(it.key) || items.length >= R.QUEUE.perCity) continue;
        const x = { id: it.id != null ? Number(it.id) : null, key: it.key, saveFor: !!it.saveFor };
        if (B[it.key].place === 'tile') { const t = Number(it.t); if (!(t >= 0 && t < S.map.tiles.length)) continue; x.t = t; }
        if (it.product && B[it.key].recipes && B[it.key].recipes[it.product]) x.product = it.product;
        items.push(x);
      }
      if (items.length) out[c.id] = items;
    }
    return out;
  }
  function cleanKeep(S, pid, k) {
    const out = {};
    for (const [cid, goods] of Object.entries(k || {})) {
      const c = cityById(S, Number(cid));
      if (!c || c.owner !== pid || !goods) continue;
      const g2 = {};
      for (const [g, v] of Object.entries(goods)) if (GOODS.includes(g) && num0(v) > 0) g2[g] = num0(v);
      if (Object.keys(g2).length) out[c.id] = g2;
    }
    return out;
  }
  function cleanRecurring(S, pid, list) {
    const out = [];
    for (const o of Array.isArray(list) ? list : []) {
      if (out.length >= R.RECURRING.max || !o) continue;
      const c = cityById(S, Number(o.city));
      if (!c || c.owner !== pid || !GOODS.includes(o.good)) continue;
      const side = o.side === 'sell' ? 'sell' : 'buy';
      const mode = side === 'buy' ? (o.mode === 'topup' ? 'topup' : 'fixed') : (o.mode === 'surplus' ? 'surplus' : 'fixed');
      const amount = num0(o.amount);
      if (mode === 'fixed' && amount <= 0) continue;
      const price = o.price == null || o.price === '' ? null : num0(o.price) || null;
      const until = o.until == null || o.until === '' ? null : num0(o.until) || null;
      out.push({ id: o.id != null ? Number(o.id) : null, side, mode, good: o.good, city: c.id, amount, price, until });
    }
    return out;
  }
  // cities in the order they draw on national manpower (the player's order first, then the rest by founding)
  function cityOrderOf(S, pid) {
    const mine = citiesOf(S, pid), p = S.players[pid], seen = new Set(), out = [];
    for (const id of (p && p.cityOrder) || []) { const c = mine.find((x) => x.id === Number(id)); if (c && !seen.has(c.id)) { seen.add(c.id); out.push(c); } }
    for (const c of mine.slice().sort((a, b) => a.id - b.id)) if (!seen.has(c.id)) out.push(c);
    return out;
  }
  const keepOf = (S, pid, cid, g) => { const p = S.players[pid]; return (p && p.keep && p.keep[cid] && p.keep[cid][g]) || 0; };
  // what a queued building still lacks in a city (goods above the city's minimums, manpower above the national minimum)
  function queueShortfall(S, pid, c, key, mpFree) {
    const cost = buildCost(S, pid, key), miss = {};
    for (const [g, v] of Object.entries(cost)) {
      if (g === 'mp') continue;
      const have = (c.stock[g] || 0) - keepOf(S, pid, c.id, g);
      if (have < v - 1e-9) miss[g] = round1(v - Math.max(0, have));
    }
    if ((cost.mp || 0) > mpFree + 1e-9) miss.mp = round1((cost.mp || 0) - Math.max(0, mpFree));
    return miss;
  }
  const shortText = (miss) => [miss.mp ? `${miss.mp} manpower` : null, goodsText(goodsOnly(miss)) === 'nothing' ? null : goodsText(goodsOnly(miss))].filter(Boolean).join(' and ');
  // next turn's military pay, roughly: every combat unit, less one free berth per barracks / port it sits in
  function estimatePay(S, pid) {
    const freeLand = new Map(), freeShip = new Map();
    let total = 0;
    for (const u of unitsOf(S, pid)) {
      if (U[u.type].role !== 'combat') continue;
      const c = cityAt(S, u.t);
      if (c && c.owner === pid && u.carriedBy == null) {
        if (!freeLand.has(c.id)) { freeLand.set(c.id, countB(S, c.id, 'barracks') * R.FREE_BERTHS.barracks); freeShip.set(c.id, countB(S, c.id, 'port') || countB(S, c.id, 'harbor') ? R.FREE_BERTHS.port : 0); }
        if (landCombat(u) && freeLand.get(c.id) > 0) { freeLand.set(c.id, freeLand.get(c.id) - 1); continue; }
        if (U[u.type].cls === 'ship' && freeShip.get(c.id) > 0 && portOk(S, c, u)) { freeShip.set(c.id, freeShip.get(c.id) - 1); continue; }
      }
      total += payOf(S, u);
    }
    return total;
  }


  /* =====================================================================
     LOANS
     Domestic: 12-turn bonds. Interest (annual rate / 12 of the face value) every turn, the face value with the
     last payment. Income = average tax-office income over the last 12 turns (missing turns count as 0).
     International: fixed-rate loans with equal payments, PMT = P r (1+r)^n / ((1+r)^n - 1), r = annual / 12.
     ===================================================================== */
  const LN = R.LOANS;
  function incomeAvg(S, pid) {
    const h = (S.players[pid] && S.players[pid].taxHistory) || [];
    return h.slice(-LN.incomeTurns).reduce((a, v) => a + (v || 0), 0) / LN.incomeTurns;
  }
  const unrestOn = (S, pid, turn) => { const p = S.players[pid]; return !!p && p.unrestUntil != null && (turn != null ? turn : S.turn) <= p.unrestUntil; };
  const unrestLeft = (S, pid, turn) => (unrestOn(S, pid, turn) ? S.players[pid].unrestUntil - (turn != null ? turn : S.turn) + 1 : 0);
  const loanParams = (S, pid) => govOf(S, pid).loan || R.GOVERNMENTS.provisional.loan;
  const taxAdjOf = (S, pid) => LN.taxAdj[(S.players[pid] && S.players[pid].tax) || 'normal'] || 0;
  const domesticDebt = (S, pid) => ((S.players[pid] && S.players[pid].loans) || []).reduce((a, l) => a + l.face, 0);
  const r2 = (v) => Math.round(v * 100) / 100;
  // debt as a share of a year's income (0.5 = 50%); with no income, any debt counts as far over the limit
  const debtRatio = (S, pid, debt) => { const annual = incomeAvg(S, pid) * 12; return annual > 0 ? debt / annual : (debt > 0 ? Infinity : 0); };
  const penaltyNow = (S, pid, turn) => (unrestOn(S, pid, turn) ? LN.defaultFlat + (S.players[pid].unrestRate || 0) : 0);
  // The rate for a new domestic loan of `amount`, fixed for its 12 turns: government base + tax adjustment now
  // + slope × (debt at the loan's midpoint ÷ yearly income × 10) + the default penalty while it lasts.
  // Pricing on the midpoint (debt before + half the loan) makes one big loan cost the same as many small ones.
  function newLoanRate(S, pid, turn, amount, extraDebt) {
    const lp = loanParams(S, pid), mid = domesticDebt(S, pid) + (extraDebt || 0) + (Math.max(0, Number(amount) || 0)) / 2;
    const ratio = debtRatio(S, pid, mid);
    return r2(Math.max(0, lp.base + taxAdjOf(S, pid) + lp.slope * (Number.isFinite(ratio) ? ratio : 0) * 10 + penaltyNow(S, pid, turn)));
  }
  const loanRateNow = (S, pid, l) => l.rate; // fixed when the loan was taken
  const loanInterest = (S, pid, l) => Math.ceil((l.face * l.rate) / 100 / 12 - 1e-9);
  const loanDueNow = (S, pid, l) => loanInterest(S, pid, l) + (l.paid >= LN.term - 1 ? l.face : 0);
  function borrowLimit(S, pid) {
    const avg = incomeAvg(S, pid), lp = loanParams(S, pid), debt = domesticDebt(S, pid);
    const cap = Math.floor(lp.capMonths * avg), room = Math.max(0, cap - debt);
    return { avg, cap, debt, room, max: room, ratio: debtRatio(S, pid, debt) };
  }
  function checkBorrow(S, pid, amount) {
    const a = Math.floor(Number(amount) || 0), lim = borrowLimit(S, pid);
    if (a <= 0) return 'Enter an amount';
    if (a > lim.room) return `That would take your domestic debt past its limit (${loanParams(S, pid).capMonths} months of income); you can borrow ${lim.room} more`;
    return null;
  }
  // payment for an international loan (whole credits; the last payment settles whatever is left)
  function loanPayment(P, annual, n) {
    const r = annual / 100 / 12;
    if (!r) return Math.ceil(P / n);
    const f = Math.pow(1 + r, n);
    return Math.round((P * r * f) / (f - 1));
  }
  const intlInterest = (l) => Math.round((l.balance * l.rate) / 100 / 12);
  const intlDueNow = (l) => { const i = intlInterest(l); return l.paid >= l.term - 1 || l.payment >= l.balance + i ? l.balance + i : l.payment; };
  const loansOf = (S, pid) => (S.loans || []).filter((l) => l.borrower === pid || l.lender === pid);
  // what a nation must pay on its debts in a coming turn (domestic, then international)
  function debtService(S, pid) {
    const p = S.players[pid];
    let n = 0;
    for (const l of (p && p.loans) || []) n += loanDueNow(S, pid, l);
    for (const l of S.loans || []) if (l.borrower === pid) n += intlDueNow(l);
    return n;
  }
  function checkLoanTerms(pl) {
    const amount = Math.floor(Number(pl.amount) || 0), term = Math.floor(Number(pl.term) || 0), rate = Math.round((Number(pl.rate) || 0) * 10) / 10;
    if (amount <= 0) return 'Enter an amount';
    if (term < 1 || term > LN.intl.maxTerm) return `The term must be 1 to ${LN.intl.maxTerm} turns`;
    if (rate < 0 || rate > LN.intl.maxRate) return `The rate must be 0% to ${LN.intl.maxRate}% a year`;
    return null;
  }


  /* =====================================================================
     ALLIANCES, HISTORY, RANKINGS
     ===================================================================== */
  const alliesOf = (S, pid) => new Set(S.treaties.filter((t) => t.type === 'alliance' && (t.a === pid || t.b === pid)).map((t) => (t.a === pid ? t.b : t.a)));
  const allied = (S, a, b) => S.treaties.some((t) => t.type === 'alliance' && pairs(t, a, b));
  // what a nation owes and is owed (domestic loans, loans between nations, reparations)
  function debtOwed(S, pid) {
    const p = S.players[pid];
    return ((p && p.loans) || []).reduce((a, l) => a + l.face, 0) + (S.loans || []).filter((l) => l.borrower === pid).reduce((a, l) => a + l.balance, 0);
  }
  const owedTo = (S, pid) => (S.loans || []).filter((l) => l.lender === pid).reduce((a, l) => a + l.balance, 0);
  const netWealth = (S, pid) => (S.players[pid] ? S.players[pid].credits : 0) + owedTo(S, pid) - debtOwed(S, pid);
  // 12-turn averages from the history (turns not yet recorded count as 0)
  function avgHist(S, pid, k) {
    const h = ((S.players[pid] && S.players[pid].hist) || []).slice(-R.LOANS.incomeTurns);
    return h.reduce((a, x) => a + (x[k] || 0), 0) / R.LOANS.incomeTurns;
  }
  const financialWeight = (S, pid) => avgHist(S, pid, 'netWealth') + 6 * avgHist(S, pid, 'netIncome');
  const tilesHeld = (S, pid) => { const mine = new Set(citiesOf(S, pid).map((c) => c.id)); return S.map.tiles.reduce((n, t) => n + (t.owner != null && mine.has(t.owner) ? 1 : 0), 0); };
  // ranks only (never the figures); ties go to the lower player number
  function rankings(S) {
    const act = S.players.filter((p) => !p.eliminated);
    const hp = (pid, cls) => S.units.filter((u) => u.owner === pid && U[u.type].role === 'combat' && (cls === 'ship' ? U[u.type].cls === 'ship' : U[u.type].cls !== 'ship')).reduce((a, u) => a + Math.max(0, u.hp), 0);
    const metric = {
      financial: (p) => financialWeight(S, p.id),
      army: (p) => hp(p.id, 'land'),
      navy: (p) => hp(p.id, 'ship'),
      technology: (p) => (p.cum && p.cum.science) || 0,
      size: (p) => tilesHeld(S, p.id),
      manufacturing: (p) => (p.cum && p.cum.value) || 0,
    };
    const out = {}, show = Math.ceil(act.length / 2);
    // a nation with nothing in a category (no navy, no science yet) is not ranked in it
    for (const [k, f] of Object.entries(metric)) out[k] = act.map((p) => [p.id, f(p)]).filter(([, v]) => k === 'financial' || v > 0).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, show).map(([id]) => id);
    return out;
  }

  /* =====================================================================
     TURN RESOLUTION
     Phase order: diplomacy -> combat -> movement -> market buys -> market sells
     -> research -> production -> buildings -> units -> logistics (routes,
     supply & upkeep, repairs, military pay) -> building queues -> end of turn.
     Loan payments come right after diplomacy, before anything else can spend the credits.
     ===================================================================== */
  const ORDER_LISTS = ['attacks', 'sabotage', 'moves', 'board', 'unload', 'buys', 'sells', 'research', 'designs', 'dump', 'disband', 'demolish', 'clear', 'builds', 'trains', 'found', 'cargo', 'routeOps', 'diplo', 'finance'];

  // Bring a saved game from an older version up to date.
  function migrate(S) {
    if (!S || !S.players) return S;
    for (const p of S.players) {
      if (p.eliminated == null) p.eliminated = !!p.annexed;
      for (const k of ['annexed', 'vassalOf', 'approvals', 'lastTributeTurn', 'tributeDemand', 'refusedTribute', 'libPending']) delete p[k];
    }
    for (const t of S.map.tiles) { if (t.bridgeBy === undefined) t.bridgeBy = null; }
    S.depots = S.depots || [];
    S.designs = S.designs || [];
    for (const p of S.players) { if (!p.designBlueprints) p.designBlueprints = []; if (!p.retiredDesigns) p.retiredDesigns = []; }
    for (const u of S.units || []) if (U[u.type] && U[u.type].role === 'combat' && !u.store) u.store = {};
    if ((S.version || 1) < 3) {
      // version 3: national mobilization, doctrines, credits x10
      for (const p of S.players) {
        p.credits = Math.round((p.credits || 0) * 10);
        p.mob = S.wars.some((w) => w.a === p.id || w.b === p.id) ? 'full' : 'peace';
        p.mobPending = null; p.mobDown = null;
        p.doctrine = { naval: null, army: null, warfare: null }; p.doctrineSince = {};
        p.supplyPriority = R.SUPPLY_PRIORITY.slice();
      }
      for (const u of S.units || []) { delete u.ready; delete u.pay; delete u.payStatus; u.xp = u.xp || 0; }
      for (const b of S.buildings) if (b.key === 'taxOffice' || b.key === 'university') b.product = Object.keys(B[b.key].recipes)[0];
    }
    for (const p of S.players) {
      if (!p.doctrine) p.doctrine = { naval: null, army: null, warfare: null };
      if (!p.doctrineSince) p.doctrineSince = {};
      if (!p.mob) p.mob = 'peace';
      if (!p.supplyPriority) p.supplyPriority = R.SUPPLY_PRIORITY.slice();
      if (!p.gov) { p.gov = 'provisional'; p.govSince = null; p.tax = 'normal'; p.taxSince = null; p.upheavalUntil = null; p.rally = false; }
      if ((S.version || 0) < 7 && p.gov === 'monarchy' && p.govSince == null) { p.gov = 'provisional'; p.tax = 'normal'; p.taxSince = null; } // nobody chose yet
    }
    for (const p of S.players) {
      // version 8: standing orders
      if (!p.queue) p.queue = {};
      if (!p.keep) p.keep = {};
      if (p.keepCredits == null) p.keepCredits = 0;
      if (p.keepManpower == null) p.keepManpower = 0;
      if (!p.cityOrder) p.cityOrder = [];
      if (!p.recurring) p.recurring = [];
      // version 9: loans. Games already under way start with their recent tax income filled in from today's tax offices.
      if (!p.loans) p.loans = [];
      // version 10: a loan's rate is fixed when taken (it used to follow the tax rate), so fold today's tax adjustment in
      if ((S.version || 0) < 10) for (const l of p.loans) l.rate = Math.max(0, l.rate + (R.LOANS.taxAdj[p.tax || 'normal'] || 0));
      if (p.unrestRate == null) p.unrestRate = 0;
      if (p.unrestUntil === undefined) p.unrestUntil = null;
      if (p.lastDomesticDefault === undefined) p.lastDomesticDefault = null;
      if (p.lastForeignDefault === undefined) p.lastForeignDefault = null;
      if (!p.taxHistory) {
        const est = S.buildings.filter((b) => b.key === 'taxOffice' && buildingOwner(S, b) === p.id).reduce((a, b) => a + creditsOutOf(S, b), 0);
        p.taxHistory = Array.from({ length: Math.min(R.LOANS.incomeTurns, Math.max(0, (S.turn || 1) - 1)) }, () => est);
      }
    }
    S.loans = S.loans || [];
    // version 11: alliances, calls to arms, reparations, history and the newspaper
    S.calls = S.calls || []; S.grievances = S.grievances || []; S.news = S.news || [];
    if (!S.firstResearched) { S.firstResearched = {}; for (const p of S.players) for (const k of p.researched || []) if (!S.firstResearched[k]) S.firstResearched[k] = { by: p.id, turn: 0 }; }
    for (const p of S.players) { if (!p.hist) p.hist = []; if (!p.cum) p.cum = { science: 0, value: 0 }; }
    S.ultimatums = S.ultimatums || [];
    S.proposals = (S.proposals || []).filter((pr) => ['peace', 'treaty', 'blueprint', 'route'].includes(pr.kind));
    if ((S.version || 1) < 4) {
      // version 4: charcoal refineries move into their city; rubber plantations make raw rubber
      for (const b of S.buildings) {
        if (b.key === 'charcoalRefinery') { const c = cityById(S, b.city); if (c) b.t = c.t; }
        if (/^rubberPlantation/.test(b.key)) b.product = 'rawRubber';
      }
      for (const p of S.players) if (p.priority && !p.priority.includes('rubberWorks')) { const i = p.priority.indexOf('rubberPlantation3'); p.priority.splice(i < 0 ? p.priority.length : i + 1, 0, 'rubberWorks', 'rubberRefinery'); }
    }
    if ((S.version || 1) < 5) {
      // version 5: tank traps belong to a nation (they used to record a city)
      for (const tile of S.map.tiles) if (tile.trap != null) { const c = cityById(S, tile.trap); tile.trap = c ? c.owner : null; }
    }
    // version 12: named wars, the newspaper as stories, the ad auction and the leak
    S.warNames = S.warNames || [];
    for (const w of S.wars) if (!w.name) { w.name = autoWarName(S, w.since || S.turn, S.players[w.a], S.players[w.b]); S.warNames.push(w.name); }
    for (const c of S.calls) if (!c.war) c.war = warNameOf(S, c.defender, c.attacker);
    S.records = S.records || {}; S.pressIdx = S.pressIdx || { tip: 0, cls: 0 }; if (S.lastScoop === undefined) S.lastScoop = null;
    const SEC_PRI = { war: 90, peace: 80, alliances: 65, government: 60, finance: 55, mobilization: 50, technology: 45, market: 10 };
    S.news = (S.news || []).map((iss) => iss.stories ? iss : {
      turn: iss.turn, date: dateText(iss.turn), market: [], scoop: null, ads: [], tip: null, classified: null, rankings: iss.rankings || {},
      stories: Object.entries(iss.sections || {}).flatMap(([sec, l]) => l.map((body) => ({ sec, pri: SEC_PRI[sec] || 10, head: null, body }))).sort((a, b) => b.pri - a.pri),
    });
    for (const dz of S.designs || []) if (dz.built == null && S.units.some((u) => u.design === dz.id)) dz.built = dz.turn || 0;
    // version 13: the market's share of world production is fixed per game (games before this keep 5%)
    if (S.marketTrickle == null) S.marketTrickle = R.MARKET.trickle;
    S.version = 13;
    return S;
  }
  function normalizeOrders(o) {
    const out = { settings: (o && o.settings) || null, ad: (o && o.ad && typeof o.ad === 'object') ? o.ad : null };
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
    // the world newspaper for this turn: stories with a priority (the highest leads the front page) and a headline
    const press = makeRng(hashSeed(`${S.seed}:press:${turn}`));
    const pick = (arr) => arr[Math.floor(press() * arr.length)];
    const UP = (x) => String(x).toUpperCase();
    const stories = [];
    const story = (sec, pri, head, body, extra) => { stories.push(Object.assign({ sec, pri, head, body }, extra || {})); };
    // per nation: made (goods), mp, tax, sci, earned (credits), paid (debt payments), got (payments received), and
    // what the press might leak: units built and lost, units without food or ammunition, new designs, research, idle buildings
    // salvage: goods that would otherwise be lost (overflowing storage, captured or destroyed cargo, overrun depots,
    // dumped cargo) go to the global market at the end of the turn, unpaid
    const salvage = {};
    const toSalvage = (goods) => { for (const [g, v] of Object.entries(goods || {})) if (GOODS.includes(g) && v > 0) salvage[g] = (salvage[g] || 0) + v; };
    const T = {};
    const tr = (pid) => (T[pid] = T[pid] || { made: {}, mp: 0, tax: 0, sci: 0, earned: 0, paid: 0, got: 0, built: {}, lost: 0, hungry: 0, noAmmo: 0, designs: [], researched: [], idle: 0 });
    S.calls = S.calls || []; S.grievances = S.grievances || []; S.firstResearched = S.firstResearched || {};
    const active = S.players.filter((p) => !p.eliminated);
    const O = {};
    for (const p of active) O[p.id] = normalizeOrders((ordersByPlayer || {})[p.id]);
    for (const u of S.units) u.moved = 0;
    const startPos = new Map(S.units.map((u) => [u.id, u.t]));
    const moving = new Set(); for (const p of active) for (const mv of O[p.id].moves) moving.add(Number(mv.unit));
    for (const c of S.cities) c.attacked = false;
    const prices = computePrices(S); // fixed for the whole turn
    const pname = (id) => S.players[id].name;

    function destroyUnit(u, why, byPid) {
      const at = posOf(S, u);
      for (const x of carried(S, u)) destroyUnit(x, `lost aboard ${unitName(u)}`, byPid);
      S.units = S.units.filter((x) => x !== u);
      for (const r of S.routes) r.transports = r.transports.filter((id) => id !== u.id);
      tr(u.owner).lost++;
      toSalvage(u.cargo); toSalvage(u.store);
      rep(u.owner, 'combat', `${unitName(u)} was destroyed (${why}).`);
      if (byPid != null && byPid !== u.owner) rep(byPid, 'combat', `${pname(u.owner)}'s ${unitName(u)} was destroyed${U[u.type].cargo && Object.keys(u.cargo || {}).length ? ' with its cargo' : ''}.`);
    }
    // A logistics unit brought to 0 HP by an adjacent attacker of the same kind is captured: it changes hands at 1 HP
    // with 75% of its cargo; everything it was carrying is destroyed.
    function captureUnit(u, by) {
      const old = u.owner;
      for (const x of carried(S, u)) destroyUnit(x, `lost when ${unitName(u)} was captured`, by);
      for (const r of S.routes) r.transports = r.transports.filter((id) => id !== u.id);
      u.route = null; u.leg = null;
      const kept = {};
      for (const [g, v] of Object.entries(u.cargo || {})) { const k = round1((v || 0) * R.CAPTURE_CARGO); if (k > 0) kept[g] = k; if (v - k > 0) toSalvage({ [g]: v - k }); }
      u.cargo = kept; u.owner = by; u.hp = 1; u.moved = 0; u.supplied = true; u.paid = true;
      delete u.dig;
      both(by, old, 'combat', `${pname(by)} captured ${pname(old)}'s ${unitName(u)} at ${tileLabel(S, u.t)}${Object.keys(kept).length ? `, with ${goodsText(kept)} aboard` : ''}.`);
    }
    // spoils go to the nearest of the winner's cities with room, like a market purchase
    function deliverHome(pid, goods, at) {
      const got = {}, homes = citiesOf(S, pid).sort((a, b) => dist(S.map, a.t, at) - dist(S.map, b.t, at));
      for (const [g, v] of Object.entries(goods)) {
        let left = v;
        for (const c of homes) { if (left <= 0) break; const a = addToCity(S, c, g, left); if (a) { got[g] = (got[g] || 0) + a; left -= a; } }
        if (left > 0) toSalvage({ [g]: left });
      }
      return got;
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
      for (const u of unitsOf(S, loser.id)) { toSalvage(u.cargo); toSalvage(u.store); S.units = S.units.filter((x) => x !== u); }
      for (const r of S.routes.filter((x) => x.owner === loser.id || x.partner === loser.id)) removeRoute(r.id, `${loser.name} was eliminated`);
      S.treaties = S.treaties.filter((t) => t.a !== loser.id && t.b !== loser.id);
      S.wars = S.wars.filter((w) => w.a !== loser.id && w.b !== loser.id);
      S.proposals = S.proposals.filter((pr) => pr.from !== loser.id && pr.to !== loser.id);
      S.ultimatums = (S.ultimatums || []).filter((u) => u.from !== loser.id && u.to !== loser.id);
      for (const tile of S.map.tiles) { if (tile.rail === loser.id) tile.rail = byPid; if (tile.bridgeBy === loser.id) tile.bridgeBy = byPid; if (tile.tunnel === loser.id) tile.tunnel = byPid; if (tile.trap === loser.id) tile.trap = byPid; }
      for (const dp of S.depots) if (dp.owner === loser.id) dp.owner = byPid;
      for (const q of S.players) rep(q.id, 'diplomacy', `${loser.name} lost its last city to ${winner.name} and is out of the game. ${winner.name} took its ${took}.`);
      story('war', 95, pick([`${UP(loser.name)} IS NO MORE`, `${UP(loser.name)} FALLS`, `THE END OF ${UP(loser.name)}`]), `${loser.name} lost its last city to ${winner.name} and is out of the game.`, { war: true });
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
      for (const tile of S.map.tiles) if (tile.owner === c.id) { if (tile.rail === old) tile.rail = to; if (tile.bridgeBy === old) tile.bridgeBy = to; if (tile.tunnel === old) tile.tunnel = to; if (tile.trap === old) tile.trap = to; }
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
      if (tile.rail === old) tile.rail = to;
      if (tile.tunnel === old) tile.tunnel = to;
      if (tile.trap === old) tile.trap = to;
      if (tile.bridgeBy === old) tile.bridgeBy = to;
    }
    // how: { kind: 'declare' | 'ultimatum' | 'ally', name (chosen by the declarer), def (the ally's name), body, grievance }
    function startWar(p, target, msg, how) {
      how = how || {};
      const ended = S.treaties.some((t) => t.type === 'alliance' && pairs(t, p.id, target.id));
      let name = cleanWarName(how.name);
      if (!name && how.grievance && !(S.warNames || []).some((x) => x.toLowerCase() === 'the war of unpaid reparations')) name = 'The War of Unpaid Reparations';
      if (!name) name = autoWarName(S, turn, p, target);
      S.warNames = S.warNames || [];
      if (!S.warNames.includes(name)) S.warNames.push(name);
      S.wars.push({ id: S.nextId++, a: p.id, b: target.id, kind: 'war', since: turn, name });
      S.treaties = S.treaties.filter((t) => !pairs(t, p.id, target.id)); // allies who go to war with each other end their alliance
      S.grievances = S.grievances.filter((g) => !(g.from === p.id && g.against === target.id));
      const A = UP(p.name), Bn = UP(target.name), N = UP(name);
      if (how.kind === 'ally') story('war', 92, pick([`${A} ENTERS ${N}`, `${A} JOINS ${UP(how.def)} IN ${N}`, `${A} ANSWERS THE CALL: WAR ON ${Bn}`]), how.body || `${msg} It joins ${name}.`, { war: true, name });
      else if (how.kind === 'ultimatum') story('war', 100, pick([`${Bn} DEFIES ULTIMATUM: WAR WITH ${A}`, `ULTIMATUM EXPIRES: ${A} AT WAR WITH ${Bn}`]), `${msg} The conflict is to be known as ${name}.`, { war: true, name });
      else story('war', 100, pick([`${A} DECLARES WAR ON ${Bn}`, `${A} AND ${Bn} AT WAR`, `${A} MARCHES ON ${Bn}`]), `${msg} The conflict is to be known as ${name}.`, { war: true, name });
      if (ended) story('alliances', 64, `${A}–${Bn} ALLIANCE IN RUINS`, `The alliance between ${p.name} and ${target.name} ended when they went to war.`);
      msg = `${msg} (${name})`;
      // a call to arms goes to every ally of the nation attacked
      for (const c of alliesOf(S, target.id)) {
        const ally = S.players[c];
        if (c === p.id || ally.eliminated || atWar(S, c, p.id)) continue;
        S.calls.push({ id: S.nextId++, ally: c, defender: target.id, attacker: p.id, issued: turn, deadline: turn + R.ALLIANCE.answerTurns, war: name });
        rep(c, 'diplomacy', `Call to arms: your ally ${target.name} was attacked by ${p.name}. Honor it to join the war at once, or refuse; you have until turn ${turn + R.ALLIANCE.answerTurns} to answer, and every nation will learn your choice.`);
      }
      for (const r of S.routes.slice()) if ((r.owner === p.id && r.partner === target.id) || (r.owner === target.id && r.partner === p.id)) removeRoute(r.id, 'war was declared');
      S.ultimatums = S.ultimatums.filter((x) => !pairs({ a: x.from, b: x.to }, p.id, target.id));
      for (const q of S.players) if (!q.eliminated) rep(q.id, 'diplomacy', msg);
      if (govOf(S, target.id).rally) {
        target.rally = true;
        if (target.mobPending && target.mobPending.to === 'full') target.mobPending.at = turn; // a countdown already under way completes now
        rep(target.id, 'war', 'War was declared on you: your nation rallies. Order full mobilization and it takes effect when the turn resolves.');
      }
    }
    function applyPeace(pr) {
      const a = S.players[pr.from], b = S.players[pr.to], pl = normPeace(pr.payload);
      const err = checkPeace(S, a.id, b.id, pl);
      if (err) { both(a.id, b.id, 'diplomacy', `The ${pr.ultimatum ? 'ultimatum\'s terms' : 'peace treaty'} between ${a.name} and ${b.name} could not be carried out: ${err}.`); return false; }
      const wasWar = atWar(S, a.id, b.id), wname = warNameOf(S, a.id, b.id);
      S.wars = S.wars.filter((w) => !pairs(w, a.id, b.id));
      const repTxt = [];
      if (pl.term > 0) {
        S.treaties = S.treaties.filter((t) => !(t.type === 'peace' && pairs(t, a.id, b.id)));
        S.treaties.push({ id: S.nextId++, a: a.id, b: b.id, type: 'peace', since: turn, endsTurn: turn + pl.term + 1 });
      }
      const desc = describeProposal(S, pr);
      for (const [giver, recv, part] of [[a, b, pl.give], [b, a, pl.get]]) {
        giver.credits -= part.credits; recv.credits += part.credits;
        giver.science -= part.science; recv.science += part.science;
        for (const id of part.cities) { const c = cityById(S, id); transferCity(c, recv.id); }
        for (const t of part.tiles) transferTile(t, recv.id);
        for (const id of part.units) {
          const u = unitById(S, id);
          for (const x of [u, ...carried(S, u)]) { x.owner = recv.id; x.route = null; x.leg = null; }
          for (const r of S.routes) r.transports = r.transports.filter((tid) => tid !== u.id);
        }
      }
      // reparations: the total split into equal whole-credit payments, the remainder paid on the last turn
      for (const [giver, recv, part] of [[a, b, pl.give], [b, a, pl.get]]) {
        const rp = part.reparations;
        if (!rp || !rp.amount || !wasWar) continue;
        S.loans.push({ id: S.nextId++, kind: 'reparations', lender: recv.id, borrower: giver.id, principal: rp.amount, rate: 0, term: rp.turns, payment: Math.floor(rp.amount / rp.turns), balance: rp.amount, paid: 0, missed: 0, since: turn });
        repTxt.push(`${giver.name} will pay ${recv.name} ${rp.amount} credits in reparations over ${rp.turns} month${rp.turns === 1 ? '' : 's'}.`);
      }
      refreshTraits(S);
      if (wasWar) {
        // a treaty is named after the oldest city of the nation that accepted it
        const town = citiesOf(S, b.id).sort((x, y) => x.id - y.id)[0] || citiesOf(S, a.id).sort((x, y) => x.id - y.id)[0];
        const tname = town ? `the Treaty of ${town.name}` : 'a treaty', N = wname ? UP(wname) : 'THE WAR';
        story('peace', 85, pick([town ? `TREATY OF ${UP(town.name)} ENDS ${N}` : `PEACE: ${N} IS OVER`, `PEACE! ${N} IS OVER`]),
          `${a.name} and ${b.name} made peace, signing ${tname}${wname ? ` to end ${wname}` : ''}.${pl.term > 0 ? ` Neither may make war on the other before ${dateText(turn + pl.term + 1)}.` : ''}${repTxt.length ? ` ${repTxt.join(' ')}` : ''}`);
      } else if (pr.ultimatum) story('war', 75, pick([`${UP(b.name)} BOWS TO ${UP(a.name)}'S DEMANDS`, `${UP(b.name)} YIELDS: NO WAR WITH ${UP(a.name)}`]), `${b.name} accepted ${a.name}'s ultimatum and handed over what was demanded. There will be no war.`);
      S.calls = S.calls.filter((c) => !(pairs({ a: c.defender, b: c.attacker }, a.id, b.id)));
      if (!pr.ultimatum) both(a.id, b.id, 'diplomacy', `${a.name} and ${b.name} signed ${desc}${wasWar ? ', ending their war' : ''}.${pl.term > 0 ? ` Neither may declare war on the other before turn ${turn + pl.term + 1}.` : ''}`);
      return true;
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
      if (st.fuel) for (const [bid, on] of Object.entries(st.fuel)) {
        const b = S.buildings.find((x) => x.id === Number(bid));
        if (b && buildingOwner(S, b) === p.id && B[b.key].fuelUse) b.fuelOn = !!on;
      }
      if (Array.isArray(st.supplyPriority)) p.supplyPriority = [...new Set([...st.supplyPriority.filter((k) => U[k] && U[k].role === 'combat'), ...R.SUPPLY_PRIORITY])];
      // doctrines: one per group, researched, locked for DOCTRINE_LOCK turns once chosen
      if (st.doctrine) for (const [group, key] of Object.entries(st.doctrine)) {
        const dd = R.DOCTRINES[key];
        if (!dd || dd.group !== group || !p.researched.includes(key)) continue;
        if (p.doctrine[group] === key) continue;
        const since = p.doctrineSince[group];
        if (p.doctrine[group] && since != null && turn < since + R.DOCTRINE_LOCK) { rep(p.id, 'war', `${R.DOCTRINE_GROUPS[group]} doctrine is locked until turn ${since + R.DOCTRINE_LOCK}.`); continue; }
        p.doctrine[group] = key; p.doctrineSince[group] = turn;
        rep(p.id, 'war', `Adopted the ${dd.name} doctrine.`);
        refreshTraits(S);
      }
      // mobilization: up one step at a time (peace -> partial next turn; partial -> full in 3 turns); down when the turn resolves
      if (st.mobilize && R.MOBILIZE.levels.includes(st.mobilize)) {
        const L = R.MOBILIZE.levels, want = L.indexOf(st.mobilize), cur = L.indexOf(p.mob), pend = p.mobPending ? L.indexOf(p.mobPending.to) : -1;
        if (want < cur || (p.mobPending && want <= cur)) { p.mobDown = st.mobilize; p.mobPending = null; }
        else if (want > cur && p.rally && st.mobilize === 'full') {
          // a democracy that has had war declared on it reaches full mobilization when this turn resolves
          p.mobPending = { to: 'full', at: turn, since: p.mobPending ? p.mobPending.since : turn, rally: true };
        } else if (want > cur && pend < 0) {
          if (p.mob === 'peace') p.mobPending = { to: 'partial', at: turn, since: turn };
          else if (p.mob === 'partial') p.mobPending = { to: 'full', at: turn + govOf(S, p.id).toFullTurns - 1, since: turn };
        }
      }
      if (st.labor) for (const [bid, n] of Object.entries(st.labor)) {
        const b = S.buildings.find((x) => x.id === Number(bid));
        if (b && buildingOwner(S, b) === p.id && recipeOf(b) && recipeOf(b).labor) b.labor = Math.min(recipeOf(b).maxLabor || Infinity, Math.max(0, Math.floor(Number(n) || 0)));
      }
      if (st.halt) for (const [bid, on] of Object.entries(st.halt)) {
        const b = S.buildings.find((x) => x.id === Number(bid));
        if (b && buildingOwner(S, b) === p.id && B[b.key].recipes) b.halted = !!on;
      }
      // government: change at most every 12 turns; housing makes half its manpower for 3 turns, and full mobilization drops to partial
      if (st.government && R.GOVERNMENTS[st.government] && st.government !== (p.gov || 'monarchy')) {
        const ready = govCooldownEnds(S, p.id);
        if (turn < ready) rep(p.id, 'government', `You cannot change government again before turn ${ready}.`);
        else {
          const was = govOf(S, p.id).name, fromProvisional = govKey(S, p.id) === 'provisional';
          p.gov = st.government; p.govSince = turn; p.taxSince = null; // a new government may set a new tax rate at once
          if (govOf(S, p.id).fixedTax) p.tax = 'normal';
          for (const q of S.players) rep(q.id, 'government', `${p.name} changed its government from ${was} to ${govOf(S, p.id).name}.`);
          { const X = UP(p.name), k = govKey(S, p.id); story('government', 60, k === 'communism' ? `REVOLUTION IN ${X}` : k === 'autocracy' ? `STRONGMAN SEIZES POWER IN ${X}` : k === 'democracy' ? `${X} EMBRACES DEMOCRACY` : k === 'monarchy' ? `${X} CROWNS A MONARCH` : `${X} INSTALLS A PROVISIONAL GOVERNMENT`, `${p.name} changed its government from ${was} to ${govOf(S, p.id).name}.`); }
          if (!fromProvisional) {
            p.upheavalUntil = turn + R.GOV_CHANGE.upheavalTurns - 1;
            if (p.mob === 'full') { p.mob = 'partial'; p.mobPending = null; }
            else if (p.mobPending && p.mobPending.to === 'full') p.mobPending = null;
            rep(p.id, 'government', `Upheaval: 0.5 comes off your housing's manpower multiplier until turn ${p.upheavalUntil} is over.`);
          }
        }
      }
      // tax rate: democracies every 6 turns, monarchies 4, autocracies 2; war tax only at partial or full mobilization
      if (st.tax && R.TAX_LEVELS.includes(st.tax) && st.tax !== (p.tax || 'normal')) {
        const ready = taxCooldownEnds(S, p.id);
        if (govOf(S, p.id).fixedTax) rep(p.id, 'government', `A ${govOf(S, p.id).name} has a fixed tax rate.`);
        else if (turn < ready) rep(p.id, 'government', `You cannot change your tax rate again before turn ${ready}.`);
        else if (st.tax === 'war' && p.mob === 'peace') rep(p.id, 'government', 'War tax needs partial or full mobilization.');
        else {
          p.tax = st.tax; p.taxSince = turn;
          for (const q of S.players) rep(q.id, 'government', `${p.name} set its tax rate to ${R.TAX_NAMES[p.tax].toLowerCase()}.`);
        }
      }
      // standing orders: each is sent whole and replaces what was there
      if (st.queue) {
        const q = cleanQueue(S, p.id, st.queue);
        for (const list of Object.values(q)) for (const it of list) if (it.id == null) it.id = S.nextId++;
        p.queue = q;
      }
      if (st.keep) p.keep = cleanKeep(S, p.id, st.keep);
      if (st.keepCredits != null) p.keepCredits = num0(st.keepCredits);
      if (st.keepManpower != null) p.keepManpower = num0(st.keepManpower);
      if (Array.isArray(st.cityOrder)) p.cityOrder = st.cityOrder.map(Number).filter((id) => { const c = cityById(S, id); return c && c.owner === p.id; });
      if (st.recurring) {
        const r = cleanRecurring(S, p.id, st.recurring);
        for (const o of r) if (o.id == null) o.id = S.nextId++;
        p.recurring = r;
      }
    }
    for (const t of S.treaties) if (t.type === 'alliance' && t.endsTurn != null && t.endsTurn <= turn) story('alliances', 58, `${UP(pname(t.a))}–${UP(pname(t.b))} ALLIANCE ENDS`, `The defensive alliance between ${pname(t.a)} and ${pname(t.b)} has ended.`);
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
        if (pl.type === 'alliance') { for (const q of S.players) rep(q.id, 'diplomacy', `${from.name} and ${p.name} signed a defensive alliance.`); story('alliances', 65, pick([`${UP(from.name)} AND ${UP(p.name)} SIGN DEFENSIVE PACT`, `${UP(from.name)}–${UP(p.name)} ALLIANCE SEALED`]), `${from.name} and ${p.name} signed a defensive alliance: each will be called to arms if the other is attacked.`); }
        else both(pr.from, p.id, 'diplomacy', `${from.name} and ${p.name} agreed ${pl.type} rights.`);
      } else if (pr.kind === 'blueprint' && pl.design != null) {
        const dz = designById(S, pl.design);
        if (!dz || dz.owner !== pr.from) { rep(p.id, 'diplomacy', 'Design sale failed: the design no longer exists.'); continue; }
        p.designBlueprints = p.designBlueprints || [];
        if (canUseDesign(S, p.id, dz)) { rep(p.id, 'diplomacy', `You already have the ${dz.name} design.`); continue; }
        if (p.credits < pl.price) { both(pr.from, p.id, 'diplomacy', `Sale of the ${dz.name} design failed: ${p.name} lacked ${pl.price} credits.`); continue; }
        p.credits -= pl.price; from.credits += pl.price; p.designBlueprints.push(dz.id); tr(from.id).earned += pl.price;
        both(pr.from, p.id, 'diplomacy', `${p.name} bought the ${dz.name} design (${U[dz.base].name.toLowerCase()}) from ${from.name} for ${pl.price} credits.`);
      } else if (pr.kind === 'blueprint') {
        if (!from.researched.includes(pl.key)) { rep(p.id, 'diplomacy', 'Blueprint sale failed: the seller no longer qualifies.'); continue; }
        if (isUnlocked(S, p.id, pl.key)) { rep(p.id, 'diplomacy', `You already have ${B[pl.key].name}.`); continue; }
        if (p.credits < pl.price) { both(pr.from, p.id, 'diplomacy', `Blueprint sale of ${B[pl.key].name} failed: ${p.name} lacked ${pl.price} credits.`); continue; }
        p.credits -= pl.price; from.credits += pl.price; p.blueprints.push(pl.key); tr(from.id).earned += pl.price;
        both(pr.from, p.id, 'diplomacy', `${p.name} bought the ${B[pl.key].name} blueprint from ${from.name} for ${pl.price} credits.`);
      } else if (pr.kind === 'route') {
        const r = S.routes.find((x) => x.id === pl.route);
        if (r) { r.accepted = true; both(pr.from, p.id, 'logistics', `Trade route #${r.id} between ${from.name} and ${p.name} is open.`); }
      } else if (pr.kind === 'loan') {
        const lender = pl.lend ? from : p, borrower = pl.lend ? p : from;
        if (lender.credits < pl.amount) { both(pr.from, p.id, 'finance', `The loan of ${pl.amount} credits fell through: ${lender.name} did not have the credits.`); continue; }
        lender.credits -= pl.amount; borrower.credits += pl.amount;
        const l = { id: S.nextId++, lender: lender.id, borrower: borrower.id, principal: pl.amount, rate: pl.rate, term: pl.term, payment: loanPayment(pl.amount, pl.rate, pl.term), balance: pl.amount, paid: 0, missed: 0, since: turn };
        S.loans.push(l);
        both(pr.from, p.id, 'finance', `${lender.name} lent ${borrower.name} ${pl.amount} credits at ${pl.rate}% a year over ${pl.term} turns: ${l.payment} credits a turn, starting next turn.`);
      }
    }
    for (const pr of S.proposals) if (pr.turn === turn && !pr.answered) {
      rep(pr.from, 'diplomacy', `${pname(pr.to)} did not answer ${describeProposal(S, pr)}; it expired.`);
      if (pr.kind === 'route') removeRoute(pr.payload.route, 'the partner did not accept in time');
    }
    S.proposals = S.proposals.filter((pr) => pr.turn > turn);

    // ultimatums: the target may accept (the terms are carried out, no war) or the sender cancel; otherwise war at the deadline
    for (const p of active) for (const o of O[p.id].diplo) {
      const u = S.ultimatums.find((x) => x.id === o.id);
      if (!u) continue;
      if (o.type === 'ultCancel' && u.from === p.id) {
        S.ultimatums = S.ultimatums.filter((x) => x !== u);
        for (const q of S.players) if (!q.eliminated) rep(q.id, 'diplomacy', `${p.name} withdrew its ultimatum to ${pname(u.to)}.`);
      } else if (o.type === 'ultAccept' && u.to === p.id && turn > u.issued) {
        if (applyPeace({ from: u.from, to: u.to, payload: Object.assign({}, u.payload, { term: 0 }), ultimatum: true })) {
          S.ultimatums = S.ultimatums.filter((x) => x !== u);
          for (const q of S.players) if (!q.eliminated) rep(q.id, 'diplomacy', `${p.name} accepted ${pname(u.from)}'s ultimatum (${describeUltimatum(S, u)}). There is no war.`);
        }
      }
    }
    // calls to arms: honor joins the war at once; refuse (or no answer by the deadline) is announced to everyone
    for (const p of active) for (const o of O[p.id].diplo) {
      if (o.type !== 'callAnswer') continue;
      const c = S.calls.find((x) => x.id === Number(o.id) && x.ally === p.id);
      if (!c) continue;
      S.calls = S.calls.filter((x) => x !== c);
      const att = S.players[c.attacker], def = S.players[c.defender];
      if (!o.honor) {
        for (const q of S.players) rep(q.id, 'diplomacy', `${p.name} refused its ally ${def.name}'s call to arms against ${att.name}.`);
        story('alliances', 70, pick([`${UP(p.name)} ABANDONS ${UP(def.name)}`, `${UP(p.name)} REFUSES CALL TO ARMS`]), `${p.name} refused ${def.name}'s call to arms against ${att.name}${c.war ? ` in ${c.war}` : ''}. The alliance stands, but ${def.name} fights alone.`);
        continue;
      }
      if (att.eliminated || !atWar(S, c.defender, c.attacker) || atWar(S, p.id, c.attacker)) { rep(p.id, 'diplomacy', `The call to arms against ${att.name} no longer applies.`); continue; }
      const pact = S.treaties.find((t) => t.type === 'peace' && pairs(t, p.id, c.attacker));
      if (pact) { rep(p.id, 'diplomacy', `You cannot honor the call to arms: your peace treaty with ${att.name} is in force until turn ${pact.endsTurn}.`); continue; }
      const wn = c.war || warNameOf(S, c.defender, c.attacker);
      startWar(p, att, `${p.name} honored its alliance with ${def.name} and declared war on ${att.name}.`, { kind: 'ally', def: def.name, name: wn, body: `${p.name} honored ${def.name}'s call to arms against ${att.name} and joins ${wn || 'the war'}.` });
    }
    for (const c of S.calls.slice()) {
      if (c.deadline > turn) continue;
      S.calls = S.calls.filter((x) => x !== c);
      if (!atWar(S, c.defender, c.attacker) || S.players[c.ally].eliminated) continue;
      for (const q of S.players) rep(q.id, 'diplomacy', `${pname(c.ally)} did not answer ${pname(c.defender)}'s call to arms against ${pname(c.attacker)}: it is counted as refused.`);
      story('alliances', 68, `SILENCE FROM ${UP(pname(c.ally))} AS ${UP(pname(c.defender))} FIGHTS ALONE`, `${pname(c.ally)} refused ${pname(c.defender)}'s call to arms against ${pname(c.attacker)} (no answer).`);
    }
    for (const u of S.ultimatums.slice()) {
      if (u.deadline > turn) continue;
      S.ultimatums = S.ultimatums.filter((x) => x !== u);
      const a = S.players[u.from], b = S.players[u.to];
      if (a.eliminated || b.eliminated || atWar(S, a.id, b.id)) continue;
      const pact = S.treaties.find((t) => t.type === 'peace' && pairs(t, a.id, b.id));
      if (pact) { both(a.id, b.id, 'diplomacy', `${a.name}'s ultimatum to ${b.name} lapsed: a peace treaty is now in force.`); continue; }
      startWar(a, b, `${b.name} did not accept ${a.name}'s ultimatum: ${a.name} is now at war with ${b.name}.`, { kind: 'ultimatum', name: u.name });
    }

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
          const err = checkDeclare(S, p.id, target.id);
          if (err) { rep(p.id, 'diplomacy', `Could not declare war on ${target.name}: ${err}.`); break; }
          const griev = S.grievances.some((g) => g.from === p.id && g.against === target.id);
          startWar(p, target, `${p.name} declared war on ${target.name}.`, { kind: 'declare', name: o.name, grievance: griev });
          break;
        }
        case 'ultimatum': {
          if (!target || target.eliminated || target.id === p.id) break;
          const err = checkUltimatum(S, p.id, target.id);
          if (err) { rep(p.id, 'diplomacy', `Could not send an ultimatum to ${target.name}: ${err}.`); break; }
          const pl = normPeace(Object.assign({}, o.payload || {}, { term: 0 }));
          pl.give.reparations.amount = 0; pl.get.reparations.amount = 0; // reparations only end a war
          const notice = Math.max(1, govOf(S, p.id).notice);
          const u = { id: S.nextId++, from: p.id, to: target.id, payload: pl, note: String(o.note || '').slice(0, 300), issued: turn, deadline: turn + notice, name: cleanWarName(o.name) || null };
          S.ultimatums.push(u);
          for (const q of S.players) if (!q.eliminated) rep(q.id, 'diplomacy', `${p.name} sent ${target.name} an ultimatum: ${describeUltimatum(S, u)}. Unless ${target.name} accepts, war begins on turn ${u.deadline}.`);
          story('war', 80, pick([`${UP(p.name)} ISSUES ULTIMATUM TO ${UP(target.name)}`, `${UP(p.name)} PRESENTS ${UP(target.name)} WITH DEMANDS`]), `${p.name} sent ${target.name} an ultimatum. Unless it is accepted, war begins in ${dateText(u.deadline)}.`);
          break;
        }
        case 'cancelTreaty': {
          const t = S.treaties.find((x) => x.id === o.id && (x.a === p.id || x.b === p.id));
          if (!t || t.endsTurn != null || t.type === 'peace') break;
          if (t.type === 'alliance') {
            t.endsTurn = turn + R.ALLIANCE.noticeTurns;
            for (const q of S.players) rep(q.id, 'diplomacy', `${p.name} gave notice to leave its alliance with ${pname(t.a === p.id ? t.b : t.a)}; it ends after turn ${t.endsTurn - 1}.`);
            story('alliances', 60, `${UP(p.name)} TO QUIT ALLIANCE WITH ${UP(pname(t.a === p.id ? t.b : t.a))}`, `${p.name} gave notice to leave its alliance with ${pname(t.a === p.id ? t.b : t.a)}. The alliance ends after ${dateText(t.endsTurn - 1)}.`);
            break;
          }
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
        if (!['transit', 'port', 'rail', 'alliance'].includes(pl.type) || atWar(S, p.id, to.id)) continue;
      } else if (o.kind === 'blueprint' && pl.design != null) {
        const dz = designById(S, pl.design);
        if (!dz || dz.owner !== p.id) { rep(p.id, 'diplomacy', 'You can only sell designs you created yourself.'); continue; }
        pl.design = dz.id; pl.price = Math.max(0, Math.floor(Number(pl.price) || 0));
      } else if (o.kind === 'blueprint') {
        if (!B[pl.key] || !p.researched.includes(pl.key)) { rep(p.id, 'diplomacy', 'You can only sell blueprints you researched yourself.'); continue; }
        pl.price = Math.max(0, Math.floor(Number(pl.price) || 0));
      } else if (o.kind === 'loan') {
        const err = checkLoanTerms(pl);
        if (err) { rep(p.id, 'finance', `Loan proposal not sent to ${to.name}: ${err}.`); continue; }
        pl = { amount: Math.floor(Number(pl.amount)), rate: Math.round(Number(pl.rate || 0) * 10) / 10, term: Math.floor(Number(pl.term)), lend: !!pl.lend };
      } else continue;
      const pr = { id: S.nextId++, from: p.id, to: to.id, kind: o.kind, payload: pl, turn: turn + 1 };
      S.proposals.push(pr);
      both(p.id, to.id, 'diplomacy', `${p.name} proposed ${describeProposal(S, pr)} to ${to.name}.`);
    }

    /* ----- loans: new domestic loans, early payoffs, defaults and forgiveness, then every debt payment ----- */
    // Debt is paid before anything else in the turn: domestic loans (oldest first), then international loans.
    const taxThisTurn = {};
    S.loans = (S.loans || []).filter((l) => !S.players[l.lender].eliminated && !S.players[l.borrower].eliminated);
    const domesticDefault = (p, amount) => {
      const annual = incomeAvg(S, p.id) * 12, share = annual > 0 ? amount / (annual * LN.step) : Infinity; // in 10% steps
      const steps = Math.max(1, Math.min(LN.penaltyCap, Number.isFinite(share) ? Math.ceil(share - 1e-9) : LN.penaltyCap)); // turns: whole steps, rounded up
      const left = unrestLeft(S, p.id, turn);
      p.unrestRate = r2(Math.min(LN.maxRatePenalty, Math.max(left ? p.unrestRate || 0 : 0, Number.isFinite(share) ? share : LN.maxRatePenalty))); // rate: exact
      p.unrestUntil = turn + Math.min(LN.penaltyCap, left + steps) - 1;
      p.lastDomesticDefault = { turn, amount };
      for (const q of S.players) rep(q.id, 'finance', `${p.name} defaulted on ${amount} credits of domestic debt.`);
      story('finance', 58, pick([`${UP(p.name)} DEFAULTS ON ITS BONDS`, `BONDHOLDERS RUINED IN ${UP(p.name)}`]), `${p.name} defaulted on ${amount} credits of domestic debt. Unrest is expected.`);
      rep(p.id, 'finance', `Unrest: housing makes 0.3 less of its multiplier and goods output falls 10% until turn ${p.unrestUntil} is over; new domestic loans cost +${LN.defaultFlat + p.unrestRate} points until then.`);
    };
    const foreignDefault = (l, why) => {
      const b = S.players[l.borrower], len = S.players[l.lender];
      S.loans = S.loans.filter((x) => x !== l);
      if (l.kind === 'reparations') {
        // unpaid reparations: the nation owed may declare war at once, whatever their peace treaty says
        S.grievances.push({ from: len.id, against: b.id, turn });
        for (const q of S.players) rep(q.id, 'finance', `${b.name} defaulted on reparations owed to ${len.name}${why ? ` (${why})` : ''}. ${len.name} may declare war on ${b.name} at once.`);
        story('finance', 62, `${UP(b.name)} STOPS PAYING REPARATIONS TO ${UP(len.name)}`, `${b.name} defaulted on reparations owed to ${len.name}; ${len.name} may declare war at once.`);
        return;
      }
      b.lastForeignDefault = turn;
      story('finance', 55, `${UP(b.name)} DEFAULTS ON FOREIGN LOAN`, `${b.name} defaulted on a loan from another nation.`);
      for (const q of S.players) if (q.id !== l.lender && q.id !== l.borrower) rep(q.id, 'finance', `${b.name} defaulted on a loan from another nation.`);
      both(l.borrower, l.lender, 'finance', `${b.name} defaulted on its loan from ${len.name} (${l.balance} credits still owed)${why ? `: ${why}` : ''}.`);
    };
    for (const p of active) for (const o of O[p.id].finance) {
      if (o.op === 'borrow') {
        const err = checkBorrow(S, p.id, o.amount);
        if (err) { rep(p.id, 'finance', `Domestic loan not taken: ${err}.`); continue; }
        const face = Math.floor(Number(o.amount)), rate = newLoanRate(S, p.id, turn, face);
        p.loans.push({ id: S.nextId++, face, rate, taken: turn, paid: 0 });
        p.credits += face;
        rep(p.id, 'finance', `Took a domestic loan of ${face} credits at ${rate}% a year: interest from next turn, the ${face} credits due on turn ${turn + LN.term}.`);
        continue;
      }
      const l = (S.loans || []).find((x) => x.id === Number(o.loan));
      if (!l) continue;
      if (o.op === 'payoff' && l.borrower === p.id) {
        if (p.credits < l.balance) { rep(p.id, 'finance', `Could not pay off the loan from ${pname(l.lender)} early: it needs ${l.balance} credits.`); continue; }
        p.credits -= l.balance; S.players[l.lender].credits += l.balance; tr(p.id).paid += l.balance; tr(l.lender).got += l.balance;
        S.loans = S.loans.filter((x) => x !== l);
        both(l.borrower, l.lender, 'finance', `${p.name} paid off its loan from ${pname(l.lender)} early (${l.balance} credits).`);
      } else if (o.op === 'default' && l.borrower === p.id) {
        foreignDefault(l, 'by choice');
      } else if (o.op === 'forgive' && l.lender === p.id) {
        S.loans = S.loans.filter((x) => x !== l);
        both(l.borrower, l.lender, 'finance', `${p.name} forgave ${pname(l.borrower)}'s ${l.kind === 'reparations' ? 'reparations' : 'loan'} (${l.balance} credits).`);
        if (l.kind === 'reparations') story('peace', 40, `${UP(p.name)} FORGIVES ${UP(pname(l.borrower))}'S REPARATIONS`, `${p.name} forgave the reparations ${pname(l.borrower)} still owed it.`);
      }
    }
    for (const p of active) {
      const keep = [];
      for (const l of (p.loans || []).filter((x) => x.taken < turn)) {
        const due = loanDueNow(S, p.id, l), last = l.paid >= LN.term - 1;
        if (p.credits >= due) {
          p.credits -= due; l.paid++; tr(p.id).paid += due;
          if (last) rep(p.id, 'finance', `Repaid a domestic loan of ${l.face} credits (${due} this turn).`);
          else keep.push(l);
        } else domesticDefault(p, l.face + loanInterest(S, p.id, l));
      }
      p.loans = keep.concat((p.loans || []).filter((x) => x.taken >= turn));
    }
    for (const l of (S.loans || []).slice()) {
      if (l.since >= turn) continue;
      const b = S.players[l.borrower], len = S.players[l.lender], due = intlDueNow(l), i = intlInterest(l);
      if (b.credits >= due) {
        b.credits -= due; len.credits += due; l.balance = Math.max(0, l.balance - (due - i)); l.paid++; l.missed = 0; tr(b.id).paid += due; tr(len.id).got += due;
        if (l.balance <= 0) { S.loans = S.loans.filter((x) => x !== l); both(l.borrower, l.lender, 'finance', l.kind === 'reparations' ? `${b.name} finished paying its reparations to ${len.name}.` : `${b.name} finished repaying its loan from ${len.name}.`); }
      } else {
        l.missed++;
        if (l.missed >= LN.intl.missedToDefault) foreignDefault(l, `${l.missed} payments missed in a row`);
        else both(l.borrower, l.lender, 'finance', `${b.name} missed a payment of ${due} credits on its ${l.kind === 'reparations' ? 'reparations to' : 'loan from'} ${len.name}; it runs a turn longer. Another miss next turn is a default.`);
      }
    }

    /* ----- 1. combat ----- */
    const attacks = [];
    for (const p of active) for (const a of O[p.id].attacks) {
      if (a.unit != null) {
        const u = unitById(S, a.unit);
        if (!u || u.owner !== p.id || u.carriedBy != null || U[u.type].role !== 'combat') { rep(p.id, 'conflict', `Attack order skipped: unit #${a.unit} is not available.`); continue; }
        if (!canAct(S, u)) { rep(p.id, 'conflict', `${unitName(u)} cannot attack: ${whyIdle(S, u)}.`); continue; }
        if (inRiver(S, u)) { rep(p.id, 'conflict', `${unitName(u)} cannot attack while wading a river.`); continue; }
        if (attacks.some((x) => x.src.unit === u.id)) continue;
        if (dist(S.map, u.t, a.t) > U[u.type].range) { rep(p.id, 'conflict', `${unitName(u)} could not attack ${tileLabel(S, a.t)}: out of range.`); continue; }
        const tgt = pickTarget(S, u.type, p.id, a.t);
        if (!tgt) { rep(p.id, 'conflict', `${unitName(u)} found no enemy it can hit at ${tileLabel(S, a.t)}.`); continue; }
        const ammo = drawGoods(supplySources(S, u), { ammo: UU(S, u).ammo }, true);
        if (!ammo.ok) { rep(p.id, 'conflict', `${unitName(u)} could not attack: no ammo in supply range.`); continue; }
        attacks.push({ owner: p.id, key: u.type, src: { unit: u.id }, name: unitName(u), from: u.t, tgt });
      } else if (a.city != null) {
        const c = cityById(S, a.city), w = a.w;
        if (!c || c.owner !== p.id || !B[w] || !B[w].weapon || !countB(S, c.id, w)) continue;
        if (attacks.some((x) => x.src.city === c.id && x.key === w)) continue;
        if (dist(S.map, c.t, a.t) > R.WEAPON_RANGE) continue;
        const tgt = pickTarget(S, w, p.id, a.t);
        if (!tgt || !tgt.unit) { rep(p.id, 'conflict', `${c.name}'s ${B[w].name.toLowerCase()} found no target at ${tileLabel(S, a.t)}.`); continue; }
        const wa = R.WEAPON_AMMO[w];
        if ((c.stock.ammo || 0) < wa) { rep(p.id, 'conflict', `${c.name}'s ${B[w].name.toLowerCase()} could not fire: needs ${wa} ammo in the city.`); continue; }
        c.stock.ammo = round1(c.stock.ammo - wa);
        attacks.push({ owner: p.id, key: w, src: { city: c.id }, name: `${c.name} ${B[w].name.toLowerCase()}`, from: c.t, tgt });
      }
    }
    const dmgU = new Map(), dmgC = new Map(), dealtBy = new Map(); // unit id -> Map(attacker -> damage)
    const adjBy = new Map(); // logistics unit id -> Map(nation -> damage from adjacent attackers of the same kind)
    const addD = (map, id, v, by) => {
      map.set(id, (map.get(id) || 0) + v);
      if (map === dmgU && by != null) { if (!dealtBy.has(id)) dealtBy.set(id, new Map()); const m = dealtBy.get(id); m.set(by, (m.get(by) || 0) + v); }
    };
    const killer = (uid) => { const m = dealtBy.get(uid); if (!m) return null; return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]; };
    const dealt = new Set(); // units that dealt damage this turn (experience)
    const modText = (r) => (r.mods.length ? ` (${r.mods.map((m) => `${m.label} ${m.v > 0 ? '+' : ''}${Math.round(m.v * 100)}%`).join(', ')})` : '');
    for (const at of attacks) {
      const au = at.src.unit != null ? unitById(S, at.src.unit) : null;
      const att = au ? { unit: au } : { weapon: at.key, owner: at.owner };
      if (at.tgt.city) {
        const r = attackDamage(S, att, { city: at.tgt.city }, { moving });
        addD(dmgC, at.tgt.city.id, r.dmg);
        if (au && r.dmg > 0) dealt.add(au.id);
        both(at.owner, at.tgt.city.owner, 'combat', `${pname(at.owner)}'s ${at.name} hit ${at.tgt.city.name} for ${r.dmg}${modText(r)}.`);
      } else {
        const tu = at.tgt.unit, r = attackDamage(S, att, { unit: tu }, { moving });
        addD(dmgU, tu.id, r.dmg, at.owner);
        if (au && r.dmg > 0 && U[tu.type].role === 'logistic' && dist(S.map, at.from, tu.t) <= 1 && (U[au.type].cls === 'ship') === (U[tu.type].cls === 'ship')) {
          if (!adjBy.has(tu.id)) adjBy.set(tu.id, new Map());
          const m = adjBy.get(tu.id); m.set(at.owner, (m.get(at.owner) || 0) + r.dmg);
        }
        if (au && r.dmg > 0) dealt.add(au.id);
        both(at.owner, tu.owner, 'combat', `${pname(at.owner)}'s ${at.name} hit ${pname(tu.owner)}'s ${unitName(tu)} for ${r.dmg}${modText(r)}.`);
        if (au && dist(S.map, at.from, tu.t) <= 1) {
          const rb = attackDamage(S, { unit: tu }, { unit: au }, { counter: true, moving });
          if (rb.dmg > 0) { addD(dmgU, au.id, rb.dmg, tu.owner); dealt.add(tu.id); both(at.owner, tu.owner, 'combat', `${unitName(tu)} struck back at ${at.name} for ${rb.dmg}${modText(rb)}.`); }
        }
      }
    }
    for (const [cid, v] of dmgC) { const c = cityById(S, cid); c.hp = Math.max(0, c.hp - v); c.attacked = true; if (c.hp === 0) rep(c.owner, 'combat', `${c.name}'s defenses are down (0 HP). Its garrison is now exposed.`); }
    for (const [uid, v] of dmgU) { const u = unitById(S, uid); if (u) u.hp = round1(u.hp - v); }
    // experience: dealing damage in a turn at full mobilization counts once
    for (const uid of dealt) {
      const u = unitById(S, uid);
      if (!u || mobOf(S, u.owner) !== 'full') continue;
      const before = stars(u); u.xp = (u.xp || 0) + 1;
      if (stars(u) > before) rep(u.owner, 'war', `${unitName(u)} is now ${R.XP.names[stars(u)].toLowerCase()} (+${Math.round(R.XP.bonus[stars(u)] * 100)}% damage).`);
    }
    for (const u of S.units.slice()) {
      if (u.hp > 0 || !S.units.includes(u)) continue;
      const adj = adjBy.get(u.id);
      if (adj && adj.size) { const by = [...adj.entries()].sort((a, b) => b[1] - a[1])[0][0]; if (atWar(S, by, u.owner)) { captureUnit(u, by); continue; } }
      destroyUnit(u, 'killed in combat', killer(u.id));
    }

    // sabotage: wreck enemy railroads and bridges outside every nation's territory
    const attackedWith = new Set(attacks.filter((a) => a.src.unit != null).map((a) => a.src.unit));
    const saboteurs = new Set();
    for (const p of active) for (const o of O[p.id].sabotage) {
      const u = unitById(S, o.unit);
      if (!u || saboteurs.has(u.id)) continue;
      if (attackedWith.has(u.id)) { rep(p.id, 'conflict', `${unitName(u)} attacked this turn, so it could not also sabotage.`); continue; }
      const err = checkSabotage(S, p.id, o);
      if (err) { rep(p.id, 'conflict', `${unitName(u)} could not sabotage at ${tileLabel(S, o.t)}: ${err}.`); continue; }
      const t = Number(o.t), tile = S.map.tiles[t], tg = sabotageTargetFor(S, u, t);
      if (tg.what === 'railroad') tile.rail = null;
      else if (tg.what === 'tankTrap') tile.trap = null;
      else if (tg.what === 'railTunnel') { tile.tunnel = null; tile.rail = null; }
      else { if (tile.bridge === 'rail') tile.rail = null; tile.bridge = false; tile.bridgeBy = null; }
      saboteurs.add(u.id);
      both(p.id, tg.owner, 'combat', `${pname(p.id)}'s ${unitName(u)} destroyed ${pname(tg.owner)}'s ${B[tg.what].name.toLowerCase()} at ${tileLabel(S, t)}.`);
    }

    /* ----- 2. movement ----- */
    // boarding
    for (const p of active) for (const b of O[p.id].board) {
      const u = unitById(S, b.unit), tr = unitById(S, b.transport);
      if (!u || !tr || u.owner !== p.id || tr.owner !== p.id || u.carriedBy != null || tr.carriedBy != null || u.route != null) continue;
      if (!canAct(S, u) || saboteurs.has(u.id)) { rep(p.id, 'conflict', `${unitName(u)} cannot board this turn${!canAct(S, u) ? `: ${whyIdle(S, u)}` : ''}.`); continue; }
      const why = canCarry(S, tr, u);
      if (why) { rep(p.id, 'conflict', `${unitName(tr)} cannot carry ${unitName(u)}: ${why}.`); continue; }
      if (dist(S.map, u.t, tr.t) > 1) { rep(p.id, 'conflict', `${unitName(u)} must be next to ${unitName(tr)} to board.`); continue; }
      if (u.t !== tr.t) u.moved += 1;
      u.carriedBy = tr.id; u.t = tr.t; u.lastMoveTurn = turn;
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
      if (!canAct(S, u)) { rep(p.id, 'conflict', `${unitName(u)} cannot move: ${whyIdle(S, u)}.`); continue; }
      if (saboteurs.has(u.id)) { rep(p.id, 'conflict', `${unitName(u)} spent the turn on sabotage and did not move.`); continue; }
      let path = Array.isArray(mv.path) ? mv.path.map(Number) : [];
      if (path.length < 2 || path[0] !== u.t) { rep(p.id, 'conflict', `${unitName(u)}'s move order no longer starts where it stands; it stayed put.`); continue; }
      if (path.length - 1 > moveOf(S, u)) { rep(p.id, 'conflict', `${unitName(u)} cannot move that far (${moveOf(S, u)} tiles this turn).`); continue; }
      // moving needs supply for every tile
      const affordable = supplyMoveLimit(S, u, path.length - 1);
      if (affordable < path.length - 1) {
        if (!affordable) { rep(p.id, 'supply', `${unitName(u)} has no supply to move and stayed put.`); continue; }
        rep(p.id, 'supply', `${unitName(u)} only had supply to move ${affordable} of ${path.length - 1} tiles.`);
        path = path.slice(0, affordable + 1);
      }
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
        const shipOf = (x) => U[x.u.type].cls === 'ship';
        const hostile = list.some((a) => list.some((b) => !friendly(S, a.u.owner, b.u.owner) && shipOf(a) === shipOf(b)));
        const captureCase = city && L.length === 1 && L[0].m && !friendly(S, city.owner, L[0].u.owner) && list.every((x) => x.m === L[0].m || (!x.m && (U[x.u.type].role !== 'combat' || shipOf(x))));
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
      m.u.t = m.dest; m.u.moved += m.path.length - 1; m.u.lastMoveTurn = turn;
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
      for (const x of unitsAt(S, c.t)) if (!friendly(S, x.owner, by)) destroyUnit(x, `caught when ${c.name} fell`, by);
      const old = c.owner, last = citiesOf(S, loser.id).length <= 1;
      c.owner = by; c.hp = 0;
      for (const tile of S.map.tiles) if (tile.owner === c.id) { if (tile.rail === old) tile.rail = by; if (tile.bridgeBy === old) tile.bridgeBy = by; if (tile.tunnel === old) tile.tunnel = by; if (tile.trap === old) tile.trap = by; }
      for (const r of S.routes.slice()) if (r.from === c.id || (r.to.type === 'city' && r.to.id === c.id)) removeRoute(r.id, `${c.name} was captured`);
      for (const q of S.players) if (!q.eliminated) rep(q.id, 'combat', `${pname(by)} captured ${c.name} from ${pname(old)}, with every good stored there.`);
      { const wn = warNameOf(S, by, old); story('war', 90, pick([`${UP(c.name)} FALLS TO ${UP(pname(by))}`, `${UP(pname(by))} TAKES ${UP(c.name)}`]), `${pname(by)} captured ${c.name} from ${pname(old)}${wn ? ` in ${wn}` : ''}.`, { war: true }); }
      if (last) eliminate(loser, by);
    }
    // field depots: an enemy land unit stepping onto one destroys it and takes half the contents home.
    // settlements: an enemy combat unit destroys it and takes everything stored there.
    for (const m of movers) {
      if (m.bounced || !S.units.includes(m.u) || U[m.u.type].cls === 'ship') continue;
      const dp = depotAt(S, m.u.t);
      if (!dp || !atWar(S, dp.owner, m.u.owner)) continue;
      const settle = isSettlement(dp);
      if (settle && U[m.u.type].role !== 'combat') continue;
      const take = {}; for (const [g, v] of Object.entries(dp.stock)) { const h = Math.floor(v * (settle ? 1 : R.LOOT)); if (h > 0) take[g] = h; if (v - h > 0) toSalvage({ [g]: v - h }); }
      const got = deliverHome(m.u.owner, take, dp.t);
      S.depots = S.depots.filter((x) => x !== dp);
      for (const r of S.routes.slice()) if (r.to.type === 'depot' && r.to.id === dp.id) removeRoute(r.id, `its ${settle ? 'settlement' : 'field depot'} was destroyed`);
      both(m.u.owner, dp.owner, 'combat', `${pname(m.u.owner)}'s ${unitName(m.u)} ${settle ? 'destroyed' : 'overran'} ${pname(dp.owner)}'s ${settle ? 'settlement' : 'field depot'} at ${tileLabel(S, dp.t)}${Object.keys(got).length ? `, carrying off ${goodsText(got)}` : ''}.`);
    }
    // unloading
    for (const p of active) for (const o of O[p.id].unload) {
      const u = unitById(S, o.unit);
      if (!u || u.owner !== p.id || u.carriedBy == null) continue;
      if (!canAct(S, u)) { rep(p.id, 'conflict', `${unitName(u)} cannot unload: ${whyIdle(S, u)}.`); continue; }
      const tr = unitById(S, u.carriedBy), t = Number(o.t);
      if (!tr || dist(S.map, tr.t, t) > 1) { rep(p.id, 'conflict', `${unitName(u)} must unload next to its transport.`); continue; }
      const probe = Object.assign({}, u, { carriedBy: null });
      if (!canEnter(S, probe, t, { final: true }) || cityAtHostile(t, p.id)) { rep(p.id, 'conflict', `${unitName(u)} cannot unload onto ${tileLabel(S, t)}.`); continue; }
      if (!slotFree(S, u, t)) { rep(p.id, 'conflict', `${unitName(u)} cannot unload: ${tileLabel(S, t)} is full.`); continue; }
      u.carriedBy = null; u.t = t; u.moved += t === tr.t ? 0 : 1; u.lastMoveTurn = turn;
      rep(p.id, 'movement', `${unitName(u)} unloaded at ${tileLabel(S, t)}.`);
    }
    function cityAtHostile(t, pid) { const c = cityAt(S, t); return c && !friendly(S, c.owner, pid); }

    /* ----- 3 & 4. global market: buys, then sells ----- */
    // Buys are a sealed-bid auction per good. Each order may name a maximum price per unit (default: the
    // market price). Higher bids fill first; equal bids share what is left in proportion to their size.
    // An order pays 1 credit more than the highest other bid left short of supply, never more than its own
    // bid and never less than the market price; when supply covers every order, everyone pays the market price.
    const buysBy = {}, reserved = {}, roomLeft = new Map();
    // recurring orders: expired ones are dropped; the rest join this turn's orders. Recurring purchases never
    // spend below the nation's credit minimum plus next turn's expected military pay; recurring sales never
    // dip below the city's minimum stock.
    const recBuys = {}, recSells = {}, crFloor = {};
    for (const p of active) {
      p.recurring = (p.recurring || []).filter((o) => o.until == null || o.until >= turn);
      crFloor[p.id] = (p.keepCredits || 0) + estimatePay(S, p.id) + debtService(S, p.id); // also next turn's loan payments
      recBuys[p.id] = []; recSells[p.id] = [];
      for (const o of p.recurring) {
        const c = cityById(S, o.city);
        if (!c || c.owner !== p.id) continue;
        const have = Math.floor((c.stock[o.good] || 0) + 1e-9);
        if (o.side === 'buy') {
          const amount = o.mode === 'topup' ? Math.max(0, o.amount - have) : o.amount;
          if (amount > 0) recBuys[p.id].push({ good: o.good, city: o.city, amount, maxPrice: o.price, rec: o });
        } else {
          const free = Math.max(0, Math.floor((c.stock[o.good] || 0) - keepOf(S, p.id, c.id, o.good) + 1e-9));
          const amount = o.mode === 'surplus' ? Math.max(0, Math.min(free, have - o.amount)) : Math.min(o.amount, free);
          if (amount <= 0) { if (o.mode === 'fixed') rep(p.id, 'market', `Recurring sale of ${R.GOOD_NAMES[o.good].toLowerCase()} from ${c.name} skipped: the city is at its minimum stock.`); continue; }
          if (o.price && sellPriceFor(S, p.id, o.good) < o.price) { rep(p.id, 'market', `Recurring sale of ${R.GOOD_NAMES[o.good].toLowerCase()} from ${c.name} skipped: the market pays ${sellPriceFor(S, p.id, o.good)}, below your floor of ${o.price}.`); continue; }
          recSells[p.id].push({ good: o.good, city: o.city, amount, rec: o });
        }
      }
    }
    for (const p of active) for (const o of [...O[p.id].buys, ...recBuys[p.id]]) {
      const g = o.good, amt = Math.floor(Number(o.amount) || 0), c = cityById(S, o.city);
      if (!GOODS.includes(g) || amt <= 0 || !c || c.owner !== p.id) continue;
      const P = prices[g].sell, cap = R.BASE_PRICE[g] * R.MARKET.maxBidX, label = o.rec ? 'Recurring purchase' : 'Market purchase';
      const bid = o.maxPrice == null || o.maxPrice === '' ? P : Math.min(cap, Math.floor(Number(o.maxPrice) || 0));
      if (bid < P) { rep(p.id, 'market', o.rec ? `${label} of ${R.GOOD_NAMES[g].toLowerCase()} for ${c.name} skipped: the price is ${P}, above your limit of ${bid}.` : `Market bid for ${R.GOOD_NAMES[g].toLowerCase()} (${bid} each) was below the market price of ${P}; nothing bought.`); continue; }
      // what the order can actually take: credits (at its own bid) and storage room in the city
      const rk = `${c.id}:${g}`, room = roomLeft.has(rk) ? roomLeft.get(rk) : freeSpace(S, c, g);
      const cash = p.credits - (reserved[p.id] || 0) - (o.rec ? crFloor[p.id] : 0), q = Math.max(0, Math.min(amt, Math.floor(cash / bid), room));
      if (q <= 0) { rep(p.id, 'market', o.rec ? `${label} of ${R.GOOD_NAMES[g].toLowerCase()} for ${c.name} skipped: ${room <= 0 ? 'no storage room' : `it would spend below your credit minimum and next turn's military pay (${crFloor[p.id]} credits held back)`}.` : `${label} of ${R.GOOD_NAMES[g].toLowerCase()} for ${c.name} could not be placed (credits or storage).`); continue; }
      reserved[p.id] = (reserved[p.id] || 0) + q * bid; roomLeft.set(rk, room - q);
      (buysBy[g] = buysBy[g] || []).push({ p, g, amt, want: q, c, bid, got: 0, rec: !!o.rec });
    }
    S.market.last = {};
    const soldOut = []; // goods the market ran out of with buyers left short
    for (const g of GOODS) {
      const list = buysBy[g];
      if (!list) continue;
      const P = prices[g].sell;
      let left = S.market.pool[g] || 0;
      const bids = [...new Set(list.map((x) => x.bid))].sort((a, b) => b - a);
      for (const b of bids) {
        const grp = list.filter((x) => x.bid === b), need = grp.reduce((a, x) => a + x.want, 0);
        if (need <= left) { for (const x of grp) x.got = x.want; left -= need; continue; }
        let given = 0;
        for (const x of grp) { x.got = Math.floor((x.want * left) / need); given += x.got; }
        for (const x of grp.slice().sort((a, b2) => b2.want - a.want)) { if (given >= left) break; if (x.got < x.want) { x.got++; given++; } }
        left -= given;
      }
      const short = list.filter((x) => x.got < x.want);
      let sold = 0, spent = 0, high = 0;
      for (const x of list) {
        const ctxt = `${R.GOOD_NAMES[g].toLowerCase()} for ${x.c.name}`;
        if (x.got <= 0) { rep(x.p.id, 'market', `Market purchase of ${ctxt} could not be filled: higher bids took the supply${x.bid > P ? ` (your bid was ${x.bid})` : ''}.`); continue; }
        const rival = short.filter((y) => y !== x).reduce((m, y) => Math.max(m, y.bid), 0);
        const price = Math.max(P, Math.min(x.bid, rival ? rival + 1 : P));
        x.p.credits -= x.got * price; S.market.pool[g] -= x.got; addToCity(S, x.c, g, x.got);
        sold += x.got; spent += x.got * price; high = Math.max(high, price);
        rep(x.p.id, 'market', `Bought ${x.got} ${ctxt} at ${price} each (${x.got * price} credits)${x.got < x.amt ? `; ordered ${x.amt}` : ''}${x.rec ? ' (recurring)' : ''}.`);
      }
      if (sold) S.market.last[g] = { qty: sold, avg: Math.round(spent / sold), high, turn };
      if (short.length && (S.market.pool[g] || 0) <= 0) soldOut.push(g);
    }
    for (const p of active) for (const o of [...O[p.id].sells, ...recSells[p.id]]) {
      const g = o.good, c = cityById(S, o.city);
      let amt = Math.floor(Number(o.amount) || 0);
      if (!GOODS.includes(g) || amt <= 0 || !c || c.owner !== p.id) continue;
      amt = Math.min(amt, Math.floor((c.stock[g] || 0) + 1e-9));
      if (amt <= 0) { rep(p.id, 'market', `Nothing to sell: ${c.name} has no ${R.GOOD_NAMES[g].toLowerCase()}.`); continue; }
      const pays = sellPriceFor(S, p.id, g);
      c.stock[g] -= amt; S.market.pool[g] = (S.market.pool[g] || 0) + amt; p.credits += amt * pays; tr(p.id).earned += amt * pays;
      rep(p.id, 'market', `Sold ${amt} ${R.GOOD_NAMES[g].toLowerCase()} from ${c.name} for ${amt * pays} credits${o.rec ? ' (recurring)' : ''}.`);
    }

    /* ----- unit designs: create, retire, restore ----- */
    for (const p of active) for (const o of O[p.id].designs) {
      p.retiredDesigns = p.retiredDesigns || [];
      if (o.op === 'retire' || o.op === 'restore') {
        const dz = designById(S, o.id);
        if (!dz || !canUseDesign(S, p.id, dz)) continue;
        p.retiredDesigns = p.retiredDesigns.filter((x) => x !== dz.id);
        if (o.op === 'retire') p.retiredDesigns.push(dz.id);
        rep(p.id, 'research', `${dz.name} ${o.op === 'retire' ? 'retired from' : 'restored to'} your build lists.`);
        continue;
      }
      const err = checkDesign(S, p.id, o);
      if (err) { rep(p.id, 'research', `Could not create the design "${o.name || ''}": ${err}.`); continue; }
      const steps = {}; for (const k of Object.keys(R.DESIGN.ranges)) if (Number((o.steps || {})[k])) steps[k] = Number(o.steps[k]);
      const dz = { id: S.nextId++, owner: p.id, base: o.base, name: String(o.name).trim(), steps, turn };
      S.designs.push(dz); p.science -= R.DESIGN.sci;
      rep(p.id, 'research', `Created the ${dz.name} design (${U[dz.base].name.toLowerCase()}) for ${R.DESIGN.sci} science.`);
    }

    /* ----- 5. research ----- */
    for (const p of active) for (const key of O[p.id].research) {
      const d = B[key] || R.DOCTRINES[key];
      if (!d || isUnlocked(S, p.id, key)) continue;
      if (p.science < d.sci) { rep(p.id, 'research', `Not enough science for ${d.name} (needs ${d.sci}, have ${p.science}).`); continue; }
      p.science -= d.sci; p.researched.push(key);
      rep(p.id, 'research', `Researched ${d.name} for ${d.sci} science.`);
      if (!S.firstResearched[key]) { S.firstResearched[key] = { by: p.id, turn }; story('technology', 45, pick([`${UP(p.name)} FIRST TO MASTER THE ${UP(d.name)}`, `BREAKTHROUGH IN ${UP(p.name)}: THE ${UP(d.name)}`]), `${p.name} is the first nation to research the ${d.name.toLowerCase()}.`); }
      else tr(p.id).researched.push(d.name);
    }

    /* ----- 6. production (before construction, so this turn's output can be built with) ----- */
    const worldMade = {};
    for (const p of active) {
      const order = (k) => { const i = p.priority.indexOf(k); return i < 0 ? 999 : i; };
      // tax offices go last, so they can count the manpower housing made this turn
      const late = (b) => (recipeOf(b).creditsPerMp && !recipeOf(b).labor ? 1 : 0);
      const mpMade = {}, mpUsed = {}, onUse = govOf(S, p.id).taxOnUse;
      const blds = S.buildings.filter((b) => buildingOwner(S, b) === p.id && B[b.key].recipes).sort((a, b) => late(a) - late(b) || order(a.key) - order(b.key) || a.id - b.id);
      const shortfalls = {};
      for (const b of blds) {
        const c = cityById(S, b.city), rc = recipeOf(b), d = B[b.key];
        if (b.halted) { b.status = 'Halted'; b.lastOut = {}; continue; }
        if ((d.base || b.key) === 'farm' && isWinter(turn)) { b.status = 'Idle: winter (farms rest until spring)'; b.lastOut = {}; continue; }
        if (rc.labor) {
          const want = laborOf(b, S), used = Math.min(want, Math.floor(p.manpower)), cr = Math.round(used * perWorkerOf(S, b));
          p.manpower = round1(p.manpower - used); p.credits += cr; b.ranTurn = turn; mpUsed[c.id] = (mpUsed[c.id] || 0) + used;
          b.lastOut = cr ? { credits: cr } : {};
          b.status = !want ? 'No workers assigned' : used < want ? `Short of manpower: ${used} of ${want} workers` : 'Running';
          if (used < want) rep(p.id, 'shortfall', `${c.name}: ${d.name} had only ${used} of ${want} workers (out of manpower).`);
          continue;
        }
        const needMp = mpOf(S, b);
        let fueled = false;
        const fu = fuelUseOf(S, b), runCr = runCreditsOf(S, b);
        if (fu && b.fuelOn !== false && (c.stock.fuel || 0) >= fu) { c.stock.fuel = round1(c.stock.fuel - fu); fueled = true; }
        const out = buildingOutput(S, b, { fueled });
        const why = [];
        const r2 = (v) => Math.round(v * 100) / 100;
        if (needMp > p.manpower) why.push(`${r2(needMp)} manpower`);
        if (runCr > p.credits) why.push(`${r2(runCr)} credits`);
        const inputs = inputsOf(b, S);
        for (const [g, v] of Object.entries(inputs)) if ((c.stock[g] || 0) < v - 1e-9) why.push(`${r2(v)} ${R.GOOD_NAMES[g].toLowerCase()}`);
        if (why.length) {
          b.status = `Idle: missing ${why.join(', ')}`; b.lastOut = {};
          const key = `${c.name}|${d.short || d.name}|${why.join(', ')}`;
          shortfalls[key] = (shortfalls[key] || 0) + 1;
          continue;
        }
        p.manpower = round1(p.manpower - needMp); p.credits -= runCr;
        if (isProductionRc(rc)) mpUsed[c.id] = (mpUsed[c.id] || 0) + needMp;
        for (const [g, v] of Object.entries(inputs)) c.stock[g] = round1((c.stock[g] || 0) - v);
        const made = {}, lost = {};
        const tp = tr(p.id);
        for (const [g, v] of Object.entries(out)) { const a = addToCity(S, c, g, v); made[g] = a; if (a < v) lost[g] = v - a; worldMade[g] = (worldMade[g] || 0) + a; tp.made[g] = (tp.made[g] || 0) + v; }
        if (rc.mpOut) { const mo = mpOutOf(S, b); p.manpower = round1(p.manpower + mo); made.manpower = mo; mpMade[c.id] = (mpMade[c.id] || 0) + mo; tp.mp += mo; }
        if (rc.sciOut) { const so = sciOutOf(S, b); p.science = round1(p.science + so); made.science = so; tp.sci += so; }
        const cr = rc.creditsPerMp && !rc.labor ? creditsOutOf(S, b, (onUse ? mpUsed : mpMade)[c.id] || 0) : creditsOutOf(S, b);
        if (cr) { p.credits += cr; made.credits = cr; tp.earned += cr; if (b.key === 'taxOffice') { taxThisTurn[p.id] = (taxThisTurn[p.id] || 0) + cr; tp.tax += cr; } }
        b.ranTurn = turn;
        b.lastOut = made;
        b.status = Object.keys(lost).length ? `Running, but storage full: lost ${goodsText(lost)}` : d.fuelUse ? (fueled ? 'Running with fuel' : 'Running without fuel (+50%)') : 'Running';
        if (Object.keys(lost).length) { toSalvage(lost); rep(p.id, 'shortfall', `${c.name}: ${d.short || d.name} output lost to full storage (${goodsText(lost)}); it went to the world market unpaid. Build storage or move goods out.`); }
      }
      for (const [key, n] of Object.entries(shortfalls)) {
        const [cn, bn, why] = key.split('|');
        rep(p.id, 'shortfall', `${cn}: ${n > 1 ? `${n}× ` : ''}${bn} idle, missing ${why}.`);
        tr(p.id).idle += n;
      }
    }

    // The global market gains a share of the world's production of goods; nobody loses anything.
    {
      const carry = S.market.carry || (S.market.carry = {}), gained = {};
      for (const g of R.GOODS) {
        const v = (worldMade[g] || 0) * marketTrickle(S) + (carry[g] || 0);
        const whole = Math.floor(v + 1e-9);
        carry[g] = Math.round((v - whole) * 1000) / 1000;
        if (whole > 0) { S.market.pool[g] = (S.market.pool[g] || 0) + whole; gained[g] = whole; }
      }
      S.market.lastTrickle = gained;
    }

    // put a finished city or territory building on the map
    function addBuilding(c, o) {
      const d = B[o.key];
      const b = { id: S.nextId++, key: o.key, city: c.id, t: d.place === 'tile' ? o.t : c.t, product: d.recipes ? Object.keys(d.recipes)[0] : null, status: 'new' };
      if (o.product && d.recipes && d.recipes[o.product]) b.product = o.product;
      S.buildings.push(b);
      if (o.key === 'townHall') claim(S, c);
      if (d.hp) c.hp = Math.min(maxHp(S, c), c.hp + d.hp);
      return b;
    }
    /* ----- 7. buildings: demolition, new cities, construction ----- */
    // dumping cargo and disbanding units
    for (const p of active) for (const o of O[p.id].dump) {
      const u = unitById(S, o.unit), g = o.good;
      if (!u || u.owner !== p.id || !U[u.type].cargo || !GOODS.includes(g)) continue;
      const q = Math.min(o.amount == null ? Infinity : Math.max(0, Number(o.amount) || 0), u.cargo[g] || 0);
      if (q > 0) { u.cargo[g] = round1(u.cargo[g] - q); toSalvage({ [g]: q }); rep(p.id, 'logistics', `${unitName(u)} dumped ${q} ${R.GOOD_NAMES[g].toLowerCase()}.`); }
    }
    for (const p of active) for (const o of O[p.id].disband) {
      const u = unitById(S, o.unit);
      const err = checkDisband(S, p.id, o);
      if (err) { rep(p.id, 'war', `Could not disband ${u ? unitName(u) : 'that unit'}: ${err}.`); continue; }
      const at = posOf(S, u), goods = {};
      for (const [g, v] of Object.entries(goodsOnly(UU(S, u).cost))) { const h = Math.floor(v * R.DEMOLISH.refund); if (h > 0) goods[g] = h; }
      for (const [g, v] of Object.entries(u.cargo || {})) if (v > 0) goods[g] = round1((goods[g] || 0) + v);
      for (const [g, v] of Object.entries(u.store || {})) if (v > 0) goods[g] = round1((goods[g] || 0) + v);
      S.units = S.units.filter((x) => x !== u);
      for (const r of S.routes) r.transports = r.transports.filter((id) => id !== u.id);
      const res = storeNear(S, p.id, at, goods, u);
      toSalvage(res.lost);
      rep(p.id, 'war', `Disbanded ${unitName(u)}. ${Object.keys(res.stored).length ? `Recovered ${goodsText(res.stored)} into nearby storage` : 'Nothing could be recovered'}${Object.keys(res.lost).length ? `; ${goodsText(res.lost)} had nowhere to go and was lost` : ''}.`);
    }
    for (const p of active) for (const o of O[p.id].demolish) {
      const err = checkDemolish(S, p.id, o);
      if (err) { rep(p.id, 'construction', `Could not demolish at ${tileLabel(S, o.t)}: ${err}.`); continue; }
      if (p.manpower < R.DEMOLISH.mp) { rep(p.id, 'construction', `Could not demolish at ${tileLabel(S, o.t)}: needs ${R.DEMOLISH.mp} manpower.`); continue; }
      const tile = S.map.tiles[o.t];
      let key, extra = null;
      if (o.what === 'city') { const b = S.buildings.find((x) => x.id === Number(o.id)); key = b.key; o.t = cityById(S, b.city).t; S.buildings = S.buildings.filter((x) => x !== b); const c = cityById(S, b.city); c.hp = Math.min(c.hp, maxHp(S, c)); }
      else if (o.what === 'depot' && isSettlement(depotAt(S, o.t))) {
        const dp = depotAt(S, o.t);
        S.depots = S.depots.filter((x) => x !== dp);
        for (const r of S.routes.slice()) if (r.to.type === 'depot' && r.to.id === dp.id) removeRoute(r.id, 'its settlement was abandoned');
        rep(p.id, 'construction', `Abandoned ${depotName(dp)} at ${tileLabel(S, o.t)}; its stores (${goodsText(dp.stock)}) were lost.`);
        continue;
      }
      else if (o.what === 'depot') { const dp = depotAt(S, o.t); key = 'fieldDepot'; S.depots = S.depots.filter((x) => x !== dp); for (const r of S.routes.slice()) if (r.to.type === 'depot' && r.to.id === dp.id) removeRoute(r.id, 'its field depot was demolished'); extra = storeNear(S, p.id, o.t, dp.stock); }
      else if (o.what === 'tunnel') { key = 'railTunnel'; tile.tunnel = null; tile.rail = null; }
      else if (o.what === 'building') { const b = tileBuilding(S, o.t); key = b.key; S.buildings = S.buildings.filter((x) => x !== b); }
      else if (o.what === 'trap') { key = 'tankTrap'; tile.trap = null; }
      else if (o.what === 'rail') { key = 'railroad'; tile.rail = null; }
      else { key = tile.bridge === 'rail' ? 'railBridge' : 'bridge'; if (tile.bridge === 'rail') tile.rail = null; tile.bridge = false; tile.bridgeBy = null; }
      p.manpower -= R.DEMOLISH.mp;
      const dest = tileOwnerCity(S, o.t) || nearestCity(p.id, o.t);
      const back = {};
      if (dest) for (const [g, v] of Object.entries(goodsOnly(B[key].cost))) { const a = addToCity(S, dest, g, Math.floor(v * R.DEMOLISH.refund)); if (a) back[g] = a; }
      rep(p.id, 'construction', `Demolished ${B[key].name.toLowerCase()} at ${tileLabel(S, o.t)}; ${goodsText(back)} returned to ${dest ? dest.name : 'nowhere'}.${extra && Object.keys(extra.stored).length ? ` Its stock (${goodsText(extra.stored)}) was moved to nearby storage.` : ''}`);
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
      const err = checkFound(S, p.id, f.depot);
      if (err) { rep(p.id, 'construction', `Could not found a city: ${err}.`); continue; }
      const dp = depotById(S, Number(f.depot)), tile = S.map.tiles[dp.t], forest = tile.type === 'forest';
      p.manpower = round1(p.manpower - foundMpOf(S, p.id) - (forest ? R.CLEAR_FOREST.mp : 0));
      const left = Object.assign({}, dp.stock);
      for (const [g, v] of Object.entries(settlementBase(S, p.id))) left[g] = round1((left[g] || 0) - v);
      if (forest) { left.tools = round1((left.tools || 0) - R.CLEAR_FOREST.tools); tile.type = 'grassland'; }
      S.depots = S.depots.filter((x) => x !== dp);
      for (const r of S.routes.slice()) if (r.to.type === 'depot' && r.to.id === dp.id) removeRoute(r.id, 'its settlement became a city');
      const name = String(f.name || '').trim().slice(0, 40) || `${p.name} ${citiesOf(S, p.id).length + 1}`;
      const c = foundCityAt(S, p.id, dp.t, name);
      for (const [g, v] of Object.entries(left)) if (v > 0) addToCity(S, c, g, v);
      if (forest) addToCity(S, c, 'lumber', R.CLEAR_FOREST.lumber);
      rep(p.id, 'construction', `Founded ${c.name} at ${tileLabel(S, c.t)}${forest ? `, clearing the forest for ${R.CLEAR_FOREST.lumber} lumber` : ''}.`);
      story('world', 22, pick([`${UP(p.name)} FOUNDS THE CITY OF ${UP(c.name)}`, `NEW CITY OF ${UP(c.name)} RISES IN ${UP(p.name)}`]), `Settlers of ${p.name} have founded the city of ${c.name}.`);
    }
    for (const p of active) for (const o of O[p.id].builds) {
      const err = checkBuild(S, p.id, o);
      const d = B[o.key];
      if (err) { rep(p.id, 'construction', `Could not build ${d ? d.name : o.key}: ${err}.`); continue; }
      const c = cityById(S, o.city), bu = (d.place === 'infra' || d.place === 'depot') && o.unit != null ? unitById(S, o.unit) : null;
      const store = bu ? bu.cargo : c.stock, from = bu ? unitName(bu) : c.name, cost = buildCost(S, p.id, o.key);
      if (!hasGoods(store, cost)) { rep(p.id, 'construction', `Could not build ${d.name} ${bu ? 'from' : 'in'} ${from}: needs ${goodsText(goodsOnly(cost))} ${bu ? 'aboard' : 'in the city'}.`); continue; }
      if (p.manpower < (cost.mp || 0)) { rep(p.id, 'construction', `Could not build ${d.name}: needs ${cost.mp} manpower.`); continue; }
      takeGoods(store, cost); p.manpower -= cost.mp || 0;
      if (o.key === 'settlement') {
        const dp = { id: S.nextId++, owner: p.id, t: o.t, stock: goodsOnly(cost), kind: 'settlement', born: turn };
        S.depots.push(dp);
        rep(p.id, 'construction', `Placed ${depotName(dp)} at ${tileLabel(S, o.t)}. Bring it ${goodsText(settlementNeeds(S, dp))} and found the city.`);
      } else if (d.place === 'depot') {
        S.depots.push({ id: S.nextId++, owner: p.id, t: o.t, stock: {} });
      } else if (d.place === 'infra') {
        const tile = S.map.tiles[o.t];
        if (o.key === 'railTunnel') { tile.tunnel = p.id; tile.rail = p.id; }
        else if (o.key === 'railroad') tile.rail = p.id;
        else if (o.key === 'railBridge') { tile.bridge = 'rail'; tile.rail = p.id; tile.bridgeBy = p.id; }
        else { tile.bridge = true; tile.bridgeBy = p.id; }
      } else if (o.key === 'tankTrap') {
        S.map.tiles[o.t].trap = p.id;
      } else addBuilding(c, o);
      rep(p.id, 'construction', `Built ${d.name}${d.place === 'city' ? ` in ${c.name}` : ` at ${tileLabel(S, o.t)}`}${bu ? ` with goods from ${unitName(bu)}` : ''}.`);
    }

    /* ----- 8. units ----- */
    for (const p of active) {
      const usedBuilders = {};
      for (const o of O[p.id].trains) {
        const dz = o.design != null ? designById(S, o.design) : null;
        const d = U[o.type] ? ustat(o.type, dz) : null;
        const err = checkTrain(S, p.id, o.city, o.type, o.design);
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
        if (dz) { u.design = dz.id; u.dname = dz.name; }
        u.hp = maxHpU(S, u);
        if (d.cargo) u.cargoCap = cargoCap(S, u);
        S.units.push(u);
        { const tp = tr(p.id); tp.built[o.type] = (tp.built[o.type] || 0) + 1; if (dz && dz.built == null) { dz.built = turn; tp.designs.push(dz); } }
        rep(p.id, 'recruitment', `${c.name} built ${unitName(u)}${t === c.t ? '' : ` at ${tileLabel(S, t)}`}.`);
      }
    }

    /* ----- 9. logistics ----- */
    // manual cargo transfers between a logistics unit and the city it stands in
    for (const p of active) for (const o of O[p.id].cargo) {
      if (o.depot != null) {
        const u = unitById(S, o.unit), dp = depotById(S, Number(o.depot)), g = o.good, amt = Math.floor(Number(o.amount) || 0);
        if (!u || !dp || u.owner !== p.id || dp.owner !== p.id || !GOODS.includes(g) || !amt) continue;
        if (u.t !== dp.t || !U[u.type].cargo) { rep(p.id, 'logistics', `${unitName(u)} must be at the field depot to load or unload.`); continue; }
        if (amt > 0 && isSettlement(dp)) { rep(p.id, 'logistics', `Goods cannot be taken back out of ${depotName(dp)}.`); continue; }
        if (amt > 0) { const q = Math.min(amt, dp.stock[g] || 0, cargoFree(u)); dp.stock[g] = round1((dp.stock[g] || 0) - q); addToUnit(u, g, q); rep(p.id, 'logistics', `${unitName(u)} loaded ${q} ${R.GOOD_NAMES[g].toLowerCase()} at ${depotName(dp)}.`); }
        else { const q = addToDepot(dp, g, Math.min(-amt, u.cargo[g] || 0), S); u.cargo[g] -= q; rep(p.id, 'logistics', `${unitName(u)} unloaded ${q} ${R.GOOD_NAMES[g].toLowerCase()} at ${depotName(dp)}.`); }
        continue;
      }
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
      } else if (toRef.type === 'depot') {
        const dp = depotById(S, toRef.id);
        if (!dp || dp.owner !== p.id) { rep(p.id, 'logistics', 'Route destination must be your own field depot.'); continue; }
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
      const dest = routeDest(S, r);
      if (!dest || (r.to.type !== 'unit' && r.partner == null && dest.owner !== r.owner)) { removeRoute(r.id, 'destination lost'); return; }
      if (!r.accepted) { r.status = 'Waiting for partner'; return; }
      if (!r.transports.length) { r.status = 'No transports assigned'; return; }
      const notes = [];
      for (const id of r.transports.slice()) {
        const u = unitById(S, id);
        if (!u) continue;
        const d = UU(S, u);
        let moves = d.move;
        const pth0 = findPath(S, u, from.t, dest.t, { partner: r.partner, ignoreUnits: true, noFord: true });
        const legLen = pth0 ? pth0.length - 1 : 0;
        const rt = pth0 ? Math.max(1, Math.ceil((2 * legLen) / d.move)) : 1;
        // Provisions a transport carries for itself: its upkeep for `legs` trips along the route, plus one spare turn
        const provisions = (legs) => {
          const need = {};
          const addUp = (o) => { for (const [g, v] of Object.entries(o)) need[g] = round1((need[g] || 0) + v); };
          for (let k = 0; k < legs; k++) for (let left = legLen; left > 0; left -= d.move) addUp(upkeepOf(S, u, Math.min(d.move, left), { anywhere: true }));
          addUp(upkeepOf(S, u, 0, { anywhere: true }));
          for (const g of Object.keys(need)) need[g] = Math.ceil(need[g] - 1e-9);
          return need;
        };
        const arrive = () => {
          if (u.leg === 'out') {
            const delivered = {}, keep = provisions(1);
            for (const g of Object.keys(u.cargo)) {
              const give = round1((u.cargo[g] || 0) - (keep[g] || 0));
              if (!(g in r.goods) || !(give > 0)) continue;
              const a = r.to.type === 'city' ? addToCity(S, dest, g, give) : r.to.type === 'depot' ? addToDepot(dest, g, give, S) : addToUnit(dest, g, give);
              u.cargo[g] -= a; if (a) delivered[g] = a;
            }
            if (Object.keys(delivered).length) {
              rep(r.owner, 'logistics', `Route #${r.id}: ${unitName(u)} delivered ${goodsText(delivered)} to ${r.to.type === 'depot' ? depotName(dest) : dest.name || unitName(dest)}.`);
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
            // first, provisions for the round trip (food or fuel the transport itself eats)
            const prov = provisions(2), shortP = {};
            for (const [g, v] of Object.entries(prov)) if ((from.stock[g] || 0) + (u.cargo[g] || 0) < v) shortP[g] = round1(v - (from.stock[g] || 0) - (u.cargo[g] || 0));
            if (Object.keys(shortP).length) { notes.push(`${unitName(u)} is waiting in ${from.name} for provisions for the trip (short ${goodsText(shortP)})`); return false; }
            for (const [g, v] of Object.entries(prov)) { const q = Math.min(cargoFree(u), Math.max(0, v - (u.cargo[g] || 0))); if (q > 0) { from.stock[g] = round1(from.stock[g] - q); addToUnit(u, g, q); } }
            // then the outbound goods
            const want = {}; let tot = 0;
            for (const [g, x] of Object.entries(r.goods)) {
              let a;
              if (r.rule === 'stock') {
                const at = r.to.type === 'unit' ? (dest.cargo[g] || 0) : (dest.stock[g] || 0);
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
          return true;
        };
        for (let guard = 0; guard < 6; guard++) {
          const target = u.leg === 'out' ? dest.t : from.t;
          const there = u.t === target || (u.leg === 'out' && r.to.type === 'unit' && dist(S.map, u.t, target) <= 1);
          if (there) { if (arrive() === false) break; if (from.t === dest.t) break; continue; }
          if (moves <= 0) break;
          const path = findPath(S, u, u.t, target, { partner: r.partner, noFord: true });
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

    // units in supply priority order: combat units by their nation's priority list, then logistics units
    const prioOf = (u) => { if (U[u.type].role !== 'combat') return 99; const L = S.players[u.owner].supplyPriority || R.SUPPLY_PRIORITY; const i = L.indexOf(u.type); return i < 0 ? 50 : i; };
    const byPrio = () => S.units.slice().sort((a, b) => a.owner - b.owner || prioOf(a) - prioOf(b) || a.id - b.id);
    // manpower: every combat unit draws a little each turn, wherever it is; units that get none lose 1 HP and cannot heal
    {
      const short = {};
      for (const u of byPrio()) {
        if (U[u.type].role !== 'combat' || !S.units.includes(u)) continue;
        const p = S.players[u.owner];
        const draw = U[u.type].cls === 'ship' ? R.MANPOWER_DRAW.ship : R.MANPOWER_DRAW.land;
        if (p.manpower >= draw - 1e-9) { p.manpower = round1(p.manpower - draw); u.mpShort = false; continue; }
        u.mpShort = true; u.hp = round1(u.hp - 1); short[p.id] = (short[p.id] || 0) + 1;
        if (u.hp <= 0) destroyUnit(u, 'no manpower to sustain it');
      }
      for (const [pid, n] of Object.entries(short)) rep(Number(pid), 'shortfall', `Out of manpower: ${n} unit${n > 1 ? 's' : ''} lost 1 HP and cannot heal.`);
    }
    // supply, upkeep, attrition and repairs (a unit gets its full need from its sources or nothing)
    for (const u of byPrio()) {
      if (!S.units.includes(u)) continue;
      const p = S.players[u.owner];
      const d = U[u.type], base = inBase(S, u), maxHp = maxHpU(S, u);
      const need = upkeepOf(S, u, u.moved);
      const sources = supplySources(S, u);
      const res = drawGoods(sources, need, true);
      u.supplied = res.ok;
      if (!res.ok) {
        const loss = isWinter(turn) && d.cls !== 'ship' ? R.WINTER_ATTRITION : 1;
        u.hp = round1(u.hp - loss); u.supply = `Out of supply (missing ${goodsText(res.missing)})`;
        if ((res.missing || {}).food) tr(u.owner).hungry++;
        if ((res.missing || {}).ammo) tr(u.owner).noAmmo++;
        rep(u.owner, 'supply', `${unitName(u)} at ${tileLabel(S, posOf(S, u))} is out of supply (missing ${goodsText(res.missing)}) and lost ${loss} HP${loss > 1 ? ' to the winter' : ''}.`);
        if (u.hp <= 0) { destroyUnit(u, 'attrition'); continue; }
      } else {
        u.supply = base ? 'In base (no upkeep)' : res.used.length ? `Supplied by ${res.used.map(sourceName).join(', ')}` : 'Supplied';
      }
      // repairs (not for units short of manpower)
      // ships repair only in or within 2 tiles of a port (a harbor for sailing ships); land units anywhere in supply
      const reach = base || (d.cls === 'ship' ? sources.some((src) => src.kind === 'city') : sources.some((src) => src.kind !== 'store' && (src.kind !== 'unit' || src.ref !== u)));
      if (u.hp < maxHp && reach && res.ok && !u.mpShort) {
        const want = round1(Math.min(base ? R.REPAIR.base : R.REPAIR.field, maxHp - u.hp));
        let done = 0, paid = {};
        const tries = [want]; for (let n = Math.floor(want - 1e-9); n >= 1; n--) if (n < want) tries.push(n);
        for (const n of tries) {
          const { goods, mp } = repairCost(S, u, n);
          if (p.manpower < mp) continue;
          if (!drawGoods(sources, goods, false).ok) continue;
          drawGoods(sources, goods, true); p.manpower = round1(p.manpower - mp); done = n; paid = goods; break;
        }
        if (done) { u.hp = round1(Math.min(maxHp, u.hp + done)); rep(u.owner, 'supply', `${unitName(u)} repaired ${done} HP${Object.keys(paid).length ? ` (about ${goodsText(roundGoods(paid))})` : ''}.`); }
      }
    }
    // combat units top up their own stores (after everyone's upkeep), in supply priority order,
    // from cities, field depots and logistics units in range - never from another unit's stores
    for (const u of byPrio()) {
      if (U[u.type].role !== 'combat' || !S.units.includes(u)) continue;
      u.store = u.store || {};
      const cap = storeCap(S, u), srcs = supplySources(S, u).filter((x) => x.kind !== 'store');
      for (const [g, c] of Object.entries(cap)) {
        let want = round1(c - (u.store[g] || 0));
        for (const src of srcs) {
          if (want <= 0) break;
          const st0 = stockRef(src), q = Math.min(want, st0[g] || 0);
          if (q > 0) { st0[g] = round1(st0[g] - q); u.store[g] = round1((u.store[g] || 0) + q); want = round1(want - q); }
        }
      }
    }
    // entrenchment: infantry that stayed put this turn dig in one level deeper (paused when out of supply,
    // below full mobilization or without the doctrine); moving, boarding or riding a transport resets it
    for (const u of S.units) {
      if (u.type !== 'infantry') continue;
      if (u.lastMoveTurn === turn || u.carriedBy != null) { u.dig = 0; continue; }
      if (doctrineOf(S, u.owner, 'warfare') === 'entrenchment' && mobOf(S, u.owner) === 'full' && u.supplied !== false) u.dig = Math.min(R.ENTRENCH.max, (u.dig || 0) + 1);
    }
    // mobilization changes take effect as the turn resolves
    for (const p of active) {
      const before = p.mob;
      if (p.mobDown) { p.mob = p.mobDown; p.mobDown = null; }
      if (p.mobPending && turn >= p.mobPending.at) { p.mob = p.mobPending.to; p.mobPending = null; }
      if (p.mob !== before) for (const q of S.players) rep(q.id, 'war', `${p.name} is now at ${p.mob === 'full' ? 'full mobilization' : p.mob === 'partial' ? 'partial mobilization' : 'peacetime'}.`);
      if (p.mob !== before) story('mobilization', 50, p.mob === 'full' ? `${UP(p.name)} MOBILIZES FOR WAR` : p.mob === 'partial' ? `${UP(p.name)} CALLS UP RESERVES` : `${UP(p.name)} STANDS DOWN`, `${p.name} is now at ${p.mob === 'full' ? 'full mobilization' : p.mob === 'partial' ? 'partial mobilization' : 'peacetime'}.`);
      if (p.mobPending && p.mobPending.since === turn) for (const q of S.players) if (q.id !== p.id) rep(q.id, 'war', `${p.name} has begun ${p.mobPending.to === 'full' ? 'full' : 'partial'} mobilization.`);
      if (p.tax === 'war' && p.mob === 'peace') { p.tax = 'high'; rep(p.id, 'government', 'Back at peacetime mobilization: your war tax dropped to the high rate.'); }
      if (p.rally && !S.wars.some((w) => w.a === p.id || w.b === p.id)) p.rally = false;
    }
    // military pay for next turn. Free: 1 land unit per barracks that started the turn on its city tile,
    // and 1 ship per city with a harbor or port that started the turn there. Unpaid units fight at half strength.
    {
      const paid = {}, short = {}, freeLand = new Map(), freeShip = new Map();
      for (const c of S.cities) {
        freeLand.set(c.t, countB(S, c.id, 'barracks') * R.FREE_BERTHS.barracks);
        freeShip.set(c.t, countB(S, c.id, 'port') || countB(S, c.id, 'harbor') ? R.FREE_BERTHS.port : 0);
      }
      for (const u of byPrio()) {
        if (U[u.type].role !== 'combat' || !S.units.includes(u)) continue;
        const p = S.players[u.owner], c = cityAt(S, u.t), stayed = startPos.get(u.id) === u.t && u.carriedBy == null;
        if (stayed && c && c.owner === u.owner) {
          if (landCombat(u) && freeLand.get(c.t) > 0) { freeLand.set(c.t, freeLand.get(c.t) - 1); u.paid = true; u.payStatus = 'Quartered in barracks: free'; continue; }
          if (U[u.type].cls === 'ship' && freeShip.get(c.t) > 0 && portOk(S, c, u)) { freeShip.set(c.t, freeShip.get(c.t) - 1); u.paid = true; u.payStatus = 'Berthed in port: free'; continue; }
        }
        const cost = payOf(S, u);
        if (p.credits >= cost) { p.credits -= cost; u.paid = true; u.payStatus = `Paid ${cost} credits`; paid[p.id] = (paid[p.id] || 0) + cost; }
        else { u.paid = false; u.payStatus = 'Unpaid: not enough credits'; short[p.id] = (short[p.id] || 0) + 1; }
      }
      for (const [pid, v] of Object.entries(paid)) rep(Number(pid), 'supply', `Paid ${v} credits to your army and navy.`);
      for (const [pid, n] of Object.entries(short)) rep(Number(pid), 'shortfall', `${n} unit${n > 1 ? 's' : ''} could not be paid and will fight at half strength next turn.`);
    }
    refreshTraits(S);
    // city regeneration
    // cities heal 10% of max HP a turn when not attacked, for 1 lumber per HP from their own stock
    for (const c of S.cities) {
      const mx = maxHp(S, c);
      if (c.hp > mx) c.hp = mx;
      if (c.attacked || c.hp >= mx) continue;
      const heal = round1(Math.min(mx * R.CITY.regenShare, mx - c.hp, (c.stock.lumber || 0) / R.CITY.healLumber));
      if (heal <= 0) continue;
      c.stock.lumber = round1((c.stock.lumber || 0) - heal * R.CITY.healLumber); c.hp = round1(c.hp + heal);
    }

    /* ----- 10. building queues (after the army has drawn its manpower and been paid) ----- */
    // Each city works down its queue in order and builds whatever it can afford without touching its minimum
    // stocks or the nation's minimum manpower; an item it cannot afford waits, and the city moves on, unless the
    // item is marked "save for", which holds everything below it. Items that can no longer be built are dropped.
    for (const p of active) {
      if (!p.queue) continue;
      let mpFree = round1(p.manpower - (p.keepManpower || 0));
      for (const c of cityOrderOf(S, p.id)) {
        const list = p.queue[c.id];
        if (!list || !list.length) continue;
        const keep = [], waiting = [];
        let held = null, heldIdx = -1;
        for (const it of list) {
          if (held) { keep.push(it); continue; }
          const d = B[it.key], o = { city: c.id, key: it.key, t: it.t, product: it.product };
          const err = checkBuild(S, p.id, o);
          if (err) { rep(p.id, 'construction', `Removed ${d.name} from ${c.name}'s queue: ${err}.`); continue; }
          const miss = queueShortfall(S, p.id, c, it.key, mpFree);
          if (Object.keys(miss).length) {
            keep.push(it); waiting.push(`${d.name} needs ${shortText(miss)} more`);
            if (it.saveFor) { held = d.name; heldIdx = keep.length - 1; }
            continue;
          }
          const cost = buildCost(S, p.id, it.key);
          takeGoods(c.stock, cost); p.manpower = round1(p.manpower - (cost.mp || 0)); mpFree = round1(mpFree - (cost.mp || 0));
          addBuilding(c, o);
          rep(p.id, 'construction', `Built ${d.name}${d.place === 'city' ? ` in ${c.name}` : ` at ${tileLabel(S, it.t)}`} from the queue.`);
        }
        if (keep.length) p.queue[c.id] = keep; else delete p.queue[c.id];
        if (waiting.length) {
          const after = held ? keep.length - heldIdx - 1 : 0;
          rep(p.id, 'construction', `${c.name}'s queue is waiting: ${waiting.join('; ')}${held && after > 0 ? `. Saving for the ${held.toLowerCase()}: ${after} item${after > 1 ? 's' : ''} behind it wait${after > 1 ? '' : 's'}` : ''}.`);
        }
      }
      for (const cid of Object.keys(p.queue)) { const c = cityById(S, Number(cid)); if (!c || c.owner !== p.id) delete p.queue[cid]; }
      for (const cid of Object.keys(p.keep || {})) { const c = cityById(S, Number(cid)); if (!c || c.owner !== p.id) delete p.keep[cid]; }
      p.recurring = (p.recurring || []).filter((o) => { const c = cityById(S, o.city); return c && c.owner === p.id; });
    }

    // a settlement whose tile has been claimed by a city (a city founded next to it, or a town hall) is taken
    // over: it disappears and the claiming city gets whatever was stored in it
    for (const dp of (S.depots || []).slice()) {
      if (!isSettlement(dp) || S.map.tiles[dp.t].owner == null) continue;
      const c = cityById(S, S.map.tiles[dp.t].owner);
      S.depots = S.depots.filter((x) => x !== dp);
      for (const r of S.routes.slice()) if (r.to.type === 'depot' && r.to.id === dp.id) removeRoute(r.id, 'its settlement was taken over');
      const got = {};
      if (c) for (const [g, v] of Object.entries(dp.stock)) { const a = addToCity(S, c, g, v); if (a) got[g] = a; }
      both(dp.owner, c ? c.owner : dp.owner, 'construction', `${pname(dp.owner)}'s settlement at ${tileLabel(S, dp.t)} is now inside ${c ? `${c.name}'s territory` : 'a city\'s territory'}; it was dissolved${Object.keys(got).length ? ` and ${c.name} took ${goodsText(got)}` : ''}.`);
    }
    // history for the graphs (24 turns) and the rankings: what each nation made, collected and owed this turn
    for (const p of active) {
      const t = tr(p.id);
      const rec = { turn, made: {}, mp: round1(t.mp), tax: Math.round(t.tax), sci: round1(t.sci), debt: debtOwed(S, p.id), credits: Math.round(p.credits),
        netWealth: netWealth(S, p.id), netIncome: Math.round(t.earned + t.got - t.paid) };
      for (const [g, v] of Object.entries(t.made)) rec.made[g] = round1(v);
      p.hist = (p.hist || []).concat([rec]).slice(-Math.max(R.HISTORY.turns, R.LOANS.incomeTurns));
      p.cum = p.cum || { science: 0, value: 0 };
      p.cum.science = round1(p.cum.science + t.sci);
      p.cum.value += Object.entries(t.made).reduce((a, [g, v]) => a + v * (R.BASE_PRICE[g] || 0), 0);
    }
    const issue = printNewspaper();
    function printNewspaper() {
      const PR = R.PRESS, GN = (g) => R.GOOD_NAMES[g], WORD = (n) => ['NO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE'][n] || String(n);
      const iss = { turn, date: dateText(turn), stories: [], market: [], scoop: null, ads: [], tip: null, classified: null, rankings: rankings(S) };
      // salvage reaches the market now (buyable next turn); only large amounts make the news
      const carry = S.market.carry || (S.market.carry = {}), big = [];
      for (const [g, v0] of Object.entries(salvage)) {
        const v = v0 + (carry[g] || 0), whole = Math.floor(v + 1e-9);
        carry[g] = Math.round((v - whole) * 1000) / 1000;
        if (whole > 0) S.market.pool[g] = (S.market.pool[g] || 0) + whole;
        if (whole >= Math.min(PR.salvageNews, Math.max(PR.salvageMin, (worldMade[g] || 0) * PR.salvageShare))) big.push([g, whole]);
      }
      if (big.length) story('market', 26, pick(['SCRAP MERCHANTS DO A ROARING TRADE', 'SALVAGE FLOODS THE MARKET', 'WHAT WAS LOST IS FOUND']), `Scrap and salvage brought ${big.sort((a, b) => b[1] - a[1]).map(([g, v]) => `${v} ${GN(g).toLowerCase()}`).join(', ')} to the world market this month.`);
      // the market report: what sold this month, and at what price
      for (const g of GOODS) { const m = S.market.last && S.market.last[g]; if (m && m.turn === turn) iss.market.push({ good: g, qty: m.qty, avg: m.avg, high: m.high, soldOut: soldOut.includes(g) }); }
      for (const g of soldOut) story('market', 30, pick([`${UP(GN(g))} SOLD OUT`, `RUN ON ${UP(GN(g))}: WORLD MARKET EMPTY`]), `The world market ran out of ${GN(g).toLowerCase()} this month, and some buyers went home empty-handed.`);
      // big price moves since last month
      const prev = S.market.prevSell || {};
      const swings = GOODS.filter((g) => prev[g] && prices[g]).map((g) => [g, (prices[g].sell - prev[g]) / prev[g]]).filter(([, d]) => Math.abs(d) >= PR.priceSwing).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, PR.swingsPerIssue);
      for (const [g, d] of swings) {
        const pct = Math.round(Math.abs(d) * 100), arms = ['ammo', 'smallArms', 'metal'].includes(g);
        story('market', 28, d > 0 ? `${UP(GN(g))} PRICES SOAR ${pct}%${arms ? ' AS NATIONS ARM' : ''}` : `${UP(GN(g))} PRICES TUMBLE ${pct}%`, `${GN(g)} costs ${prices[g].sell} on the world market this month, ${d > 0 ? 'up' : 'down'} from ${prev[g]}.`);
      }
      S.market.prevSell = {}; for (const g of GOODS) if (prices[g]) S.market.prevSell[g] = prices[g].sell;
      // world production records (measured against the level of the last record story)
      S.records = S.records || {};
      const recs = [];
      for (const g of GOODS) {
        const v = Math.round(worldMade[g] || 0); if (v <= 0) continue;
        const r = S.records[g];
        if (!r) { S.records[g] = { max: v, base: v, story: -99 }; continue; }
        if (v > r.max) {
          r.max = v;
          const gain = v / r.base - 1;
          if (turn >= PR.recordFrom && gain >= PR.recordGain && turn - r.story >= PR.recordGap) recs.push([g, gain, v]);
        }
      }
      for (const [g, , v] of recs.sort((x, y) => y[1] - x[1]).slice(0, PR.recordsPerIssue)) {
        S.records[g].story = turn; S.records[g].base = v;
        story('world', 35, pick([`WORLD ${UP(GN(g))} OUTPUT AT RECORD HIGH`, `${UP(GN(g))} BOOM: THE WORLD HAS NEVER MADE MORE`]), `The nations of the world produced ${v} ${GN(g).toLowerCase()} this month, more than ever before.`);
      }
      // war fever
      const full = active.filter((p) => !p.eliminated && p.mob === 'full').length;
      if (full >= PR.feverCount && full > (S.feverPrev || 0)) story('mobilization', 32, `WAR FEVER: ${WORD(full)} NATIONS AT FULL MOBILIZATION`, `${full} nations now stand at full mobilization. Observers fear the worst.`);
      S.feverPrev = full;
      // a new leader in the rankings
      const last = (S.news || [])[(S.news || []).length - 1], RH = { financial: ['THE LEADING FINANCIAL POWER', 'finance'], army: ['THE GREATEST ARMY', 'land forces'], navy: ['THE MIGHTIEST NAVY', 'sea power'], technology: ['THE LEADER IN SCIENCE', 'science'], size: ['THE LARGEST NATION', 'size'], manufacturing: ['THE WORKSHOP OF THE WORLD', 'manufacturing'] };
      let changes = 0;
      if (last && last.rankings) for (const k of Object.keys(RH)) {
        const was = (last.rankings[k] || [])[0], now = (iss.rankings[k] || [])[0];
        if (was == null || now == null || was === now || changes >= 2 || S.players[was].eliminated) continue;
        changes++;
        story('world', 40, `${UP(pname(now))} OVERTAKES ${UP(pname(was))} AS ${RH[k][0]}`, `${pname(now)} now leads the world in ${RH[k][1]}, ahead of ${pname(was)}.`);
      }
      // the seasons
      if (monthOf(turn + 1) === 10) story('world', 20, pick(['WINTER CLOSES IN', 'ARMIES BRACE FOR WINTER']), 'December is upon us. Until spring, land units out of supply lose 2 HP a month instead of 1.');
      if (monthOf(turn + 1) === 1) story('world', 20, pick(['THE SPRING THAW', 'SPRING AT LAST']), 'March brings the thaw. Armies in the field need no longer fear the cold.');
      // anniversaries of wars still being fought
      const seen = new Set();
      for (const w of S.wars) {
        if (!w.name || seen.has(w.name)) continue; seen.add(w.name);
        const since = Math.min(...S.wars.filter((x) => x.name === w.name).map((x) => x.since)), yrs = (turn - since) / 12;
        if (yrs >= 1 && Number.isInteger(yrs)) story('war', 25, `${WORD(yrs)} YEAR${yrs > 1 ? 'S' : ''} OF ${UP(w.name)}`, `${w.name} began ${yrs > 1 ? `${yrs} years` : 'a year'} ago this month, and there is no peace in sight.`);
      }
      // paid notices: three spaces, sold by sealed bid
      iss.ads = adAuction();
      // the leak: one secret about one nation, chosen at random
      iss.scoop = leak();
      // quiet months get a tip and a classified advertisement
      if (stories.filter((x) => x.sec !== 'market').length < PR.quietBelow) {
        S.pressIdx = S.pressIdx || { tip: 0, cls: 0 };
        const [h, b] = R.PRESS_TIPS[S.pressIdx.tip % R.PRESS_TIPS.length];
        iss.tip = { head: h, body: b };
        iss.classified = R.CLASSIFIEDS[S.pressIdx.cls % R.CLASSIFIEDS.length];
        S.pressIdx.tip++; S.pressIdx.cls++;
      }
      iss.stories = stories.map((x, i) => [x, i]).sort((x, y) => y[0].pri - x[0].pri || x[1] - y[1]).map(([x]) => x);
      return iss;
    }
    function adAuction() {
      const PR = R.PRESS, bids = [];
      for (const p of active) {
        const o = O[p.id].ad;
        if (!o) continue;
        const text = String(o.text || '').replace(/\s+/g, ' ').trim().slice(0, PR.adMaxChars), bid = Math.floor(Number(o.bid) || 0), anon = !!o.anon;
        if (!text) continue;
        if (bid < PR.adMin) { rep(p.id, 'diplomacy', `Your newspaper bid of ${bid} was below the minimum of ${PR.adMin}.`); continue; }
        const most = bid + (anon ? PR.adAnon : 0);
        if (p.credits < most) { rep(p.id, 'diplomacy', `Your newspaper bid was withdrawn: it needs up to ${most} credits and you have ${Math.floor(p.credits)}.`); continue; }
        bids.push({ p, text, bid, anon });
      }
      // highest bid wins; a tie goes to the shorter notice, then to the lower player number
      bids.sort((x, y) => y.bid - x.bid || x.text.length - y.text.length || x.p.id - y.p.id);
      const win = bids.slice(0, PR.adSlots), lose = bids.slice(PR.adSlots);
      const top = lose.reduce((m, x) => Math.max(m, x.bid), 0), out = [];
      for (const x of win) {
        const price = Math.max(PR.adMin, Math.min(x.bid, top ? top + 1 : PR.adMin)), cost = price + (x.anon ? PR.adAnon : 0);
        x.p.credits -= cost;
        rep(x.p.id, 'diplomacy', `Your notice is printed in this month's newspaper${x.anon ? ', unsigned' : ''}: ${cost} credits (${price} for the space${x.anon ? ` and ${PR.adAnon} to print it anonymously` : ''}).`);
        out.push({ by: x.anon ? null : x.p.id, text: x.text });
      }
      for (const x of lose) rep(x.p.id, 'diplomacy', `Your bid of ${x.bid} for newspaper space was outbid; nothing was charged.`);
      return out;
    }
    function leak() {
      const UNOUN = { infantry: ['infantry regiment', 'infantry regiments'], cavalry: ['cavalry regiment', 'cavalry regiments'], artillery: ['artillery battery', 'artillery batteries'], merchantman: ['merchantman', 'merchantmen'], supplyTruck: ['supply truck', 'supply trucks'] };
      const noun = (k, n) => { const x = UNOUN[k] || [U[k].name.toLowerCase(), `${U[k].name.toLowerCase()}s`]; return n === 1 ? x[0] : x[1]; };
      const WORD = (n) => ['NO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE'][n] || String(n);
      const facts = (p) => {
        const t = tr(p.id), X = UP(p.name), war = S.wars.some((w) => w.a === p.id || w.b === p.id), W = (peace, atWar) => (war ? atWar : peace), out = [];
        const wars = [...new Set(S.wars.filter((w) => w.a === p.id || w.b === p.id).map((w) => w.name).filter(Boolean))];
        const built = Object.entries(t.built).filter(([k, n]) => U[k] && U[k].role === 'combat' && (n >= 2 || U[k].cls === 'ship')).sort((a, b) => b[1] - a[1]);
        if (built.length) { const [k, n] = built[0]; out.push({ w: W(3, 4), head: `${X} ${U[k].cls === 'ship' ? 'LAUNCHES' : 'RAISES'} ${WORD(n)} NEW ${UP(noun(k, n))}`, body: `${p.name} built ${n} new ${noun(k, n)} this month, our correspondent has learned.` }); }
        if (t.lost) out.push({ w: W(2, 5), head: t.lost >= 3 ? `HEAVY LOSSES FOR ${X}` : `${X} LOSES ${WORD(t.lost)} UNIT${t.lost > 1 ? 'S' : ''}`, body: `${p.name} lost ${t.lost} unit${t.lost > 1 ? 's' : ''} this month${wars.length ? ` in ${wars.join(' and ')}` : ''}, according to sources close to its army.` });
        if (t.hungry) out.push({ w: W(2, 4), head: `${X} TROOPS SUFFER ON POOR RATIONS`, body: `${t.hungry} of ${p.name}'s units went without food this month. Soldiers' letters home speak of empty mess tins.` });
        if (t.noAmmo) out.push({ w: W(2, 5), head: `${X} RUNS DRY ON AMMUNITION`, body: `${t.noAmmo} of ${p.name}'s units ran out of ammunition this month. How will its boys fight without bullets?` });
        if (t.designs.length) { const d = designPress(t.designs[0], p); out.push({ w: 3, head: d.head, body: d.body }); }
        if (t.researched.length) out.push({ w: W(2, 1), head: `${X} SCIENTISTS MASTER THE ${UP(t.researched[0])}`, body: `${p.name} has quietly researched the ${t.researched[0].toLowerCase()}.` });
        const debt = S.loans.filter((l) => l.borrower === p.id && l.kind !== 'reparations').sort((a, b) => b.balance - a.balance)[0];
        if (debt) out.push({ w: W(3, 2), head: `${X} DEEP IN DEBT TO ${UP(pname(debt.lender))}`, body: `${p.name} owes ${pname(debt.lender)} ${Math.round(debt.balance)} credits, according to papers seen by this newspaper.` });
        if (t.idle >= 3) out.push({ w: W(2, 1), head: `IDLE FACTORIES IN ${X}`, body: `${t.idle} of ${p.name}'s buildings stood idle this month for want of workers or materials.` });
        const mun = citiesOf(S, p.id).reduce((a, c) => a + (c.stock.ammo || 0) + (c.stock.smallArms || 0), 0), was = p.munSnap;
        if (was != null && mun >= 40 && mun >= was * 1.5) out.push({ w: W(3, 3), head: `${X} QUIETLY HOARDING MUNITIONS`, body: `${p.name}'s stores of ammunition and small arms have grown to ${Math.round(mun)}, our correspondent reports.` });
        return out;
      };
      const cand = active.filter((p) => !p.eliminated).map((p) => [p, facts(p)]).filter(([, f]) => f.length);
      for (const p of active) p.munSnap = citiesOf(S, p.id).reduce((a, c) => a + (c.stock.ammo || 0) + (c.stock.smallArms || 0), 0);
      const pool = cand.length > 1 ? cand.filter(([p]) => p.id !== S.lastScoop) : cand;
      if (!pool.length) { S.lastScoop = null; return null; }
      const [p, f] = pick(pool);
      let r = press() * f.reduce((a, x) => a + x.w, 0), fact = f[0];
      for (const x of f) { r -= x.w; if (r < 0) { fact = x; break; } }
      S.lastScoop = p.id;
      rep(p.id, 'diplomacy', 'Information vital to national security has been leaked in the press.');
      return { nation: p.id, head: fact.head, body: fact.body };
    }
    // tax-office income feeds each nation's borrowing limit (the last 12 turns)
    for (const p of active) { p.taxHistory = (p.taxHistory || []).concat([taxThisTurn[p.id] || 0]).slice(-LN.incomeTurns); }
    /* ----- end of turn ----- */
    S.news = (S.news || []).concat([issue]).slice(-R.HISTORY.newsTurns);
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
      marketTrickle, dateText, designPress, autoWarName, warNameOf, cleanWarName, alliesOf, allied, debtOwed, owedTo, netWealth, avgHist, financialWeight, tilesHeld, rankings,
      incomeAvg, unrestOn, unrestLeft, loanParams, taxAdjOf, domesticDebt, debtRatio, penaltyNow, newLoanRate, loanRateNow, loanInterest, loanDueNow, borrowLimit, checkBorrow, loanPayment, intlInterest, intlDueNow, loansOf, debtService, checkLoanTerms,
      queueable, cleanQueue, cleanKeep, cleanRecurring, cityOrderOf, keepOf, queueShortfall, estimatePay,
      cityById, unitById, cityAt, unitsAt, cityBuildings, countB, tileBuilding, tileOwner, tileOwnerCity, citiesOf, unitsOf, unitName,
      garrisonOf, posOf, carried, atWar, friendly, hasTreaty, isUnlocked, unitUnlocked, territoryRadius, supplyRadius, maxHp,
      capacity, freeSpace, recipeOf, recipeKey, buildingOutput, creditsOutOf, mpOf, mpOutOf, buildingOwner, reachable, findPath, canEnter, pickTarget, attackTargets,
      cityWeaponTargets, supplySources, sourceName, upkeepOf, inBase, checkBuild, checkTrain, checkFound, routeEstimate, describeProposal,
      cargoUsed, cargoFree, portOk, dockable, slotFree, canCarry, carrySlots, demolishable, checkDemolish, checkDisband, inputsOf, monthOf, yearOf, seasonOf, isWinter, isSummer, govOf, govKey, taxOf, mpMult, govMods, fuelUseOf, runCreditsOf, sciOutOf, sellPriceFor, maxLaborOf, perWorkerOf, cityProductionMp, isProductionRc, taxCooldownEnds, govCooldownEnds, buildCost, foundMpOf, checkDeclare, checkUltimatum, describeUltimatum, rawMove, ustat, UU, designById, designOf, canUseDesign, seesDesign, checkDesign, researchedUnitSelf, repairCost, isSettlement, settlementNeeds, storeCap, giftError, depotAt, depotById, depotCap, depotFree, depotName, routeDest, checkClear, checkSabotage, sabotageTarget, sabotageTargetFor, bridgeSiteError, fording, inRiver, canAct, whyIdle, moveOf, payOf, laborOf, maxHpU, cargoCap, carryCap, stars, entrenched, entrenchLevel, blitzing, attackDamage, previewAttack, landCombat, mobOf, doctrineOf, supplyMoveLimit, normPeace, checkPeace, peaceTerms, isWater, isLand, nearWater, tileLabel, goodsText, terrain,
    },
  };
})(typeof RULES !== 'undefined' ? RULES : require('./rules.js'));
if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
