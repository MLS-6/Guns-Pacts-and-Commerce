/* =====================================================================
   SUPPLY LINES — RULES DATA
   Every number in the game lives here, so balance changes only need
   edits in this file.
   ===================================================================== */
const RULES = (() => {
  const GOODS = ['food', 'lumber', 'ore', 'fuel', 'fiber', 'rawRubber', 'rubber', 'horses', 'metal', 'cloth', 'clothing', 'tools', 'smallArms', 'ammo', 'machinery'];

  const GOOD_NAMES = {
    food: 'Food', lumber: 'Lumber', ore: 'Ore', fuel: 'Fuel', fiber: 'Fiber', rawRubber: 'Raw rubber', rubber: 'Rubber', horses: 'Horses',
    metal: 'Metal', cloth: 'Cloth', clothing: 'Clothing', tools: 'Tools', smallArms: 'Small arms', ammo: 'Ammo', machinery: 'Machinery',
  };

  const GOOD_COLORS = {
    food: '#d9a521', lumber: '#9a6534', ore: '#8c96a1', fuel: '#454545', fiber: '#c9bf9b', rawRubber: '#8fae5a', rubber: '#3f8a57', horses: '#7c4f32',
    metal: '#6f8aa8', cloth: '#c98fb6', clothing: '#a44b7d', tools: '#4f74c8', smallArms: '#b8433f', ammo: '#d8702f', machinery: '#6a4cae',
  };

  // Global market (credits)
  const BASE_PRICE = {
    food: 200, lumber: 200, ore: 300, fiber: 300, fuel: 400, horses: 600, rawRubber: 400, rubber: 1200, ammo: 600,
    cloth: 2000, metal: 1000, clothing: 4000, tools: 1400, smallArms: 1400, machinery: 4000,
  };
  // trickle: share of each turn's world production of goods that appears in the market pool (no one loses anything)
  const MARKET = { scale: 4, buyRatio: 0.8, trickle: 0.05, maxBidX: 10, trickleChoices: [0, 0.05, 0.1, 0.15, 0.2, 0.25] }; // trickle: the default; each game fixes its own rate at creation

  // Goods that warehouses and supply depots do NOT store
  const SPECIAL_STORAGE = ['food', 'fuel'];

  const TILES = {
    grassland: { name: 'Grassland', terrain: 'land', color: '#a9c46e', glyph: '' },
    forest: { name: 'Forest', terrain: 'land', color: '#55803f', glyph: '♣' },
    rubber: { name: 'Rubber trees', terrain: 'land', color: '#2f8a6d', glyph: '✿' },
    ore: { name: 'Ore vein', terrain: 'land', color: '#a8998a', glyph: '◆' },
    coal: { name: 'Coal vein', terrain: 'land', color: '#6a625d', glyph: '■' },
    silver: { name: 'Silver vein', terrain: 'land', color: '#c3c8ce', glyph: '◇' },
    gold: { name: 'Gold vein', terrain: 'land', color: '#d9b441', glyph: '✦' },
    oil: { name: 'Oil field', terrain: 'land', color: '#24211f', glyph: '▼', glyphColor: 'rgba(235,225,200,0.75)' },
    river: { name: 'River', terrain: 'water', color: '#4b92c3', glyph: '' },
    lake: { name: 'Lake', terrain: 'water', color: '#63a9d0', glyph: '' },
    ocean: { name: 'Ocean', terrain: 'water', color: '#2d5e8c', glyph: '' },
    mountain: { name: 'Mountain', terrain: 'mountain', color: '#8e8073', glyph: '▲' },
  };

  /* Buildings
     place: 'city'  -> on the city tile
            'tile'  -> on a matching tile in the city's territory
            'infra' -> railroad / bridge / rail bridge, built tile by tile
            'depot' -> field depot: on a tile, inside your territory or outside it
     riverMpLess: manpower saved per turn when its city is next to a river
     riverBonus: extra output share when the tile is next to a river (+50% = 0.5)
     railBonus: flat extra output when a railroad runs through its tile
     tier/base/bonus: upgraded extraction buildings (era 2: +50%; era 3: +100% with 1 fuel a turn, +50% without)
     recipes: what the building does each turn it operates
       mp = manpower used, in = goods used, out = goods made,
       mpOut / sciOut / creditsOut = national resources made, credits = credits used
       creditsPerMp = (tax office) credits for each manpower its city's housing produced this turn */
  const BUILDINGS = {
    residence: { name: 'Residence', era: 1, sci: 0, place: 'city', cost: { lumber: 10, tools: 2, mp: 2 }, recipes: { manpower: { in: { food: 3 }, mpOut: 3 } } },
    apartment: { name: 'Apartment', era: 2, sci: 6, place: 'city', cost: { lumber: 20, metal: 6, tools: 6, mp: 4 }, recipes: { manpower: { in: { food: 5 }, mpOut: 6 } } },
    highrise: { name: 'Highrise', era: 3, sci: 12, place: 'city', cost: { lumber: 20, metal: 20, tools: 10, machinery: 4, mp: 6 }, recipes: { manpower: { in: { food: 8 }, mpOut: 10 } } },
    farm: { name: 'Farm', abbr: 'Fm', era: 1, sci: 0, place: 'tile', tiles: ['grassland'], cost: { lumber: 6, tools: 2, mp: 1 }, recipes: { food: { mp: 1, out: { food: 10 } } }, waterMult: 1.3 }, // x1.3 next to a river or lake, after tier bonuses
    fishery: { name: 'Fishery', abbr: 'Fs', era: 1, sci: 2, place: 'tile', tiles: ['lake', 'ocean'], cost: { lumber: 6, tools: 2, mp: 1 }, recipes: { food: { mp: 1, out: { food: 8 } } }, oceanFood: 10 },
    fiberFarm: { name: 'Fiber farm', abbr: 'Fb', era: 1, sci: 2, place: 'tile', tiles: ['grassland'], cost: { lumber: 6, tools: 2, mp: 1 }, recipes: { fiber: { mp: 1, out: { fiber: 6 } } } },
    rubberPlantation: { name: 'Rubber plantation', abbr: 'Rb', era: 1, sci: 3, place: 'tile', tiles: ['rubber'], cost: { lumber: 8, tools: 2, mp: 1 }, recipes: { rawRubber: { mp: 1, out: { rawRubber: 6 } } } },
    stables: { name: 'Stables', abbr: 'St', era: 1, sci: 3, place: 'tile', tiles: ['grassland'], cost: { lumber: 10, tools: 2, mp: 1 }, recipes: { horses: { mp: 1, in: { food: 3 }, out: { horses: 3 } } } },
    lumberYard: { name: 'Lumber yard', abbr: 'Lm', era: 1, sci: 0, place: 'tile', tiles: ['forest'], cost: { lumber: 4, tools: 2, mp: 1 }, recipes: { lumber: { mp: 1, out: { lumber: 8 } } }, riverBonus: 0.5, railBonus: 2 },
    oreMine: { name: 'Ore mine', abbr: 'Om', era: 1, sci: 0, place: 'tile', tiles: ['ore'], cost: { lumber: 8, tools: 4, mp: 2 }, recipes: { ore: { mp: 1, out: { ore: 6 } } }, railBonus: 2 },
    // Silver and gold mines turn manpower into credits: assign workers (manpower per turn) up to maxLabor.
    silverMine: { name: 'Silver mine', abbr: 'Ag', era: 1, sci: 2, place: 'tile', tiles: ['silver'], cost: { lumber: 8, tools: 4, mp: 2 }, recipes: { credits: { labor: true, creditsPerMp: 250, maxLabor: 15 } } },
    goldMine: { name: 'Gold mine', abbr: 'Au', era: 1, sci: 3, place: 'tile', tiles: ['gold'], cost: { lumber: 10, metal: 4, tools: 6, mp: 3 }, recipes: { credits: { labor: true, creditsPerMp: 500, maxLabor: 10 } } },
    coalMine: { name: 'Coal mine', abbr: 'Cm', era: 1, sci: 0, place: 'tile', tiles: ['coal'], cost: { lumber: 8, tools: 4, mp: 2 }, recipes: { fuel: { mp: 1, out: { fuel: 6 } } }, railBonus: 2 },
    charcoalRefinery: { name: 'Charcoal refinery', abbr: 'Ch', era: 1, sci: 2, place: 'city', cost: { lumber: 8, tools: 3, mp: 2 }, recipes: { fuel: { mp: 1, in: { lumber: 3.5 }, out: { fuel: 2 } } } }, // 3.5 + 0.5 upkeep = 4 lumber
    oilField: { name: 'Oil field', abbr: 'Ol', era: 3, sci: 12, place: 'tile', tiles: ['oil'], cost: { lumber: 4, metal: 10, tools: 6, machinery: 4, rubber: 4, mp: 4 }, recipes: { fuel: { mp: 2, out: { fuel: 20 } } }, railBonus: 2 },

    granary: { name: 'Granary', era: 1, sci: 2, place: 'city', cost: { lumber: 10, tools: 2, mp: 1 }, storage: { food: 200 } },
    foodWarehouse: { name: 'Food warehouse', era: 2, sci: 5, place: 'city', cost: { lumber: 17, metal: 5, tools: 3, mp: 3 }, storage: { food: 500 } },
    fuelDepot: { name: 'Fuel depot', era: 3, sci: 8, place: 'city', cost: { lumber: 10, metal: 10, tools: 4, rubber: 2, mp: 2 }, storage: { fuel: 400 } },
    warehouse: { name: 'Warehouse', era: 1, sci: 3, place: 'city', cost: { lumber: 20, metal: 10, tools: 4, mp: 3 }, storageAll: 100 },
    supplyDepot: { name: 'Supply depot', era: 2, sci: 6, place: 'city', cost: { lumber: 15, metal: 10, tools: 6, rubber: 2, mp: 3 }, storageAll: 50, supplyBonus: 1 },

    metalForge: { name: 'Metal forge', era: 1, sci: 0, place: 'city', cost: { lumber: 10, tools: 4, mp: 2 }, recipes: { metal: { mp: 2, in: { ore: 4, fuel: 2 }, out: { metal: 2 } } } },
    workshop: {
      name: 'Tools/small arms/ammo workshop', short: 'Workshop', era: 1, sci: 0, place: 'city', cost: { lumber: 8, metal: 4, tools: 4, mp: 2 },
      recipes: {
        tools: { mp: 2, in: { metal: 2, lumber: 2 }, out: { tools: 2 } },
        smallArms: { mp: 2, in: { metal: 2, lumber: 2 }, out: { smallArms: 2 } },
        ammo: { mp: 2, in: { metal: 1, fuel: 1 }, out: { ammo: 3 } },
      },
    },
    textileWorkshop: {
      name: 'Textile workshop', era: 1, sci: 4, place: 'city', cost: { lumber: 8, tools: 4, mp: 2 },
      recipes: { cloth: { mp: 2, in: { fiber: 12 }, out: { cloth: 2 } }, clothing: { mp: 2, in: { cloth: 2 }, out: { clothing: 1 } } },
    },
    rubberWorks: {
      name: 'Rubber works', era: 1, sci: 3, place: 'city', cost: { lumber: 8, tools: 4, mp: 2 },
      recipes: { rubber: { mp: 2, in: { rawRubber: 4, fuel: 1 }, out: { rubber: 2 } } },
    },
    machineryWorkshop: { name: 'Machinery workshop', era: 2, sci: 8, place: 'city', cost: { lumber: 10, metal: 8, tools: 6, mp: 3 }, recipes: { machinery: { mp: 2, in: { metal: 3, tools: 2, fuel: 1 }, out: { machinery: 1 } } }, builds: ['artillery', 'train', 'supplyTruck'] },
    metalFactory: { name: 'Metal factory', era: 3, sci: 10, place: 'city', cost: { lumber: 15, metal: 20, tools: 10, machinery: 5, mp: 4 }, recipes: { metal: { mp: 4, in: { ore: 6, fuel: 2 }, out: { metal: 6 } } }, riverMpLess: 1 },
    toolsFactory: { name: 'Tools factory', era: 3, sci: 10, place: 'city', cost: { lumber: 15, metal: 20, tools: 10, machinery: 5, mp: 4 }, recipes: { tools: { mp: 4, in: { metal: 4, lumber: 4 }, out: { tools: 8 } } }, riverMpLess: 1 },
    smallArmsFactory: { name: 'Small arms factory', era: 3, sci: 10, place: 'city', cost: { lumber: 15, metal: 20, tools: 10, machinery: 5, rubber: 2, mp: 4 }, recipes: { smallArms: { mp: 4, in: { metal: 4, lumber: 4 }, out: { smallArms: 8 } } }, riverMpLess: 1 },
    ammoFactory: { name: 'Ammo factory', era: 3, sci: 10, place: 'city', cost: { lumber: 15, metal: 20, tools: 10, machinery: 5, rubber: 2, mp: 4 }, recipes: { ammo: { mp: 4, in: { metal: 2, fuel: 2 }, out: { ammo: 12 } } }, riverMpLess: 1 },
    clothFactory: { name: 'Cloth factory', era: 2, sci: 8, place: 'city', cost: { lumber: 15, metal: 15, tools: 8, machinery: 3, mp: 4 }, recipes: { cloth: { mp: 4, in: { fiber: 10 }, out: { cloth: 4 } } }, riverMpLess: 1 },
    clothingFactory: { name: 'Clothing factory', era: 2, sci: 8, place: 'city', cost: { lumber: 15, metal: 15, tools: 8, machinery: 3, mp: 4 }, recipes: { clothing: { mp: 4, in: { cloth: 4 }, out: { clothing: 4 } } }, riverMpLess: 1 },
    rubberRefinery: { name: 'Rubber refinery', era: 3, sci: 10, place: 'city', cost: { lumber: 15, metal: 20, tools: 10, machinery: 5, mp: 4 }, recipes: { rubber: { mp: 4, in: { rawRubber: 8, fuel: 2 }, out: { rubber: 8 } } }, riverMpLess: 1 },
    machineryFactory: { name: 'Machinery factory', era: 3, sci: 15, place: 'city', cost: { lumber: 15, metal: 25, tools: 12, machinery: 6, rubber: 6, mp: 5 }, recipes: { machinery: { mp: 4, in: { metal: 4, tools: 2, fuel: 1 }, out: { machinery: 3 } } }, builds: ['artillery', 'tank', 'train', 'supplyTruck'], riverMpLess: 1 },

    university: { name: 'University', era: 1, sci: 0, place: 'city', cost: { lumber: 12, metal: 4, tools: 6, mp: 3 }, recipes: { science: { mp: 6, credits: 500, sciOut: 1 } } },
    researchFacility: { name: 'Research facility', era: 3, sci: 15, place: 'city', cost: { lumber: 20, metal: 20, tools: 10, machinery: 6, mp: 8 }, recipes: { science: { mp: 12, credits: 1000, sciOut: 3 } } },
    taxOffice: { name: 'Tax office', era: 1, sci: 3, place: 'city', limit: 1, cost: { lumber: 20, metal: 6, tools: 6, mp: 3 }, recipes: { credits: { creditsPerMp: 150 } } },
    townHall: { name: 'Town hall', era: 1, sci: 4, place: 'city', limit: 1, cost: { lumber: 30, metal: 10, tools: 8, mp: 4 }, territoryBonus: 1 },

    barracks: { name: 'Barracks', era: 1, sci: 0, place: 'city', cost: { lumber: 12, metal: 4, tools: 4, mp: 2 }, builds: ['infantry', 'cavalry'] },
    harbor: { name: 'Harbor', era: 1, sci: 3, place: 'city', needsWater: true, cost: { lumber: 15, tools: 4, mp: 2 }, dock: 'sail' },
    port: { name: 'Port', era: 2, sci: 6, place: 'city', needsWater: true, cost: { lumber: 20, metal: 10, tools: 6, rubber: 4, mp: 3 }, dock: 'all' },
    shipyard: { name: 'Shipyard', era: 1, sci: 5, place: 'city', needsWater: true, cost: { lumber: 20, metal: 4, tools: 6, mp: 3 }, builds: ['merchantman', 'frigate'] },
    navalYard: { name: 'Naval yard', era: 2, sci: 10, place: 'city', needsWater: true, cost: { lumber: 20, metal: 20, tools: 10, machinery: 4, rubber: 6, mp: 4 }, builds: ['freighter', 'warship'] },

    railroad: { name: 'Railroad', abbr: 'Rail', era: 2, sci: 6, place: 'infra', cost: { lumber: 2, metal: 4, tools: 1, mp: 1 } },
    bridge: { name: 'Bridge', abbr: 'Br', era: 1, sci: 0, place: 'infra', cost: { lumber: 15, metal: 10, tools: 6, mp: 3 } },
    railBridge: { name: 'Rail bridge', abbr: 'RB', era: 2, sci: 6, place: 'infra', cost: { lumber: 17, metal: 14, tools: 7, mp: 4 } },

    // Field depot: frontline storage and a supply point, built on a tile inside your territory or outside it
    settlement: { name: 'Settlement', abbr: 'St', era: 1, sci: 0, place: 'depot', cost: { lumber: 5, tools: 1 } },
    fieldDepot: { name: 'Field depot', abbr: 'FD', era: 1, sci: 2, place: 'depot', cost: { lumber: 20, tools: 4, mp: 2 } },

    walls: { name: 'Walls', era: 1, sci: 4, place: 'city', limit: 1, cost: { lumber: 15, metal: 5, tools: 4, mp: 3 }, hp: 10 },
    fort: { name: 'Fort', era: 3, sci: 12, place: 'city', limit: 1, cost: { lumber: 30, metal: 30, tools: 12, machinery: 3, mp: 6 }, hp: 20, weapon: true },
    navalBattery: { name: 'Naval battery', era: 2, sci: 8, place: 'city', limit: 1, needsWater: true, cost: { lumber: 20, metal: 30, tools: 12, machinery: 8, mp: 6 }, hp: 10, weapon: true },
    tankTrap: { name: 'Tank trap', abbr: 'TT', era: 3, sci: 8, place: 'tile', tiles: 'anyLand', cost: { metal: 6, tools: 2, mp: 1 } },
  };

  // Era 2 and era 3 versions of the extraction buildings (demolish the old one first)
  const TIERS = {
    farm: ['Improved farm', 'Mechanized farm'], fishery: ['Improved fishery', 'Trawler fishery'], fiberFarm: ['Improved fiber farm', 'Mechanized fiber farm'],
    rubberPlantation: ['Improved plantation', 'Mechanized plantation'], oreMine: ['Deep ore mine', 'Mechanized ore mine'],
    coalMine: ['Deep coal mine', 'Mechanized coal mine'], lumberYard: ['Sawmill', 'Mechanized lumber yard'],
  };
  for (const [key, [n2, n3]] of Object.entries(TIERS)) {
    const b = BUILDINGS[key], c = b.cost;
    const copy = (extra) => Object.assign({}, b, { recipes: JSON.parse(JSON.stringify(b.recipes)), base: key }, extra);
    BUILDINGS[key + '2'] = copy({ name: n2, abbr: b.abbr + '²', era: 2, sci: 3, tier: 2, bonus: 0.5,
      cost: { lumber: c.lumber * 2, metal: c.metal || 0, tools: c.tools * 2, machinery: 1, rubber: 1, mp: c.mp + 1 } });
    BUILDINGS[key + '3'] = copy({ name: n3, abbr: b.abbr + '³', era: 3, sci: 5, tier: 3, bonus: 0.5, fuelBonus: 1, fuelUse: 1,
      cost: { lumber: c.lumber * 4, metal: (c.metal || 0) + 4, tools: c.tools * 4, machinery: 2, rubber: 2, mp: c.mp + 2 } });
    for (const k of [key + '2', key + '3']) if (!BUILDINGS[k].metal && BUILDINGS[k].cost.metal === 0) delete BUILDINGS[k].cost.metal;
  }
  // Rail tunnel: a railroad + a deep ore mine's materials + 5 ammo; mountains in your own territory only
  BUILDINGS.railTunnel = { name: 'Rail tunnel', abbr: 'Tun', era: 3, sci: 10, place: 'infra', cost: {} };
  for (const part of [BUILDINGS.railroad.cost, BUILDINGS.oreMine2.cost, { ammo: 5 }]) for (const [g, v] of Object.entries(part)) BUILDINGS.railTunnel.cost[g] = (BUILDINGS.railTunnel.cost[g] || 0) + v;

  /* Units
     cls: 'land' | 'rail' | 'ship'     role: 'combat' | 'logistic'
     idle = upkeep every turn outside a barracks/port, perTile = extra per tile moved
     repair: 'bio' (manpower), 'mech' (metal + tools), 'sail' (lumber); repairHorses = 1 horse per N HP
     carryTypes: which units a transport may carry and how many slots each takes */
  const UNITS = {
    infantry: { name: 'Infantry', abbr: 'I', cls: 'land', role: 'combat', hp: 5, move: 2, range: 1, ammo: 1, idle: { food: 1 }, perTile: { food: 1 }, repair: 'bio', capture: true, ford: true, cost: { mp: 4, clothing: 2, smallArms: 2 }, builtAt: ['barracks'], unlock: 'barracks' },
    cavalry: { name: 'Cavalry', abbr: 'C', cls: 'land', role: 'combat', hp: 7, move: 3, range: 1, ammo: 1, idle: { food: 2 }, perTile: { food: 1 }, repair: 'bio', repairHorses: 3, capture: true, ford: true, cost: { mp: 3, clothing: 2, smallArms: 2, horses: 5 }, builtAt: ['barracks'], unlock: 'stables' },
    artillery: { name: 'Artillery', abbr: 'A', cls: 'land', role: 'combat', hp: 5, move: 2, range: 2, ammo: 3, idle: { food: 1 }, perTile: { fuel: 1 }, repair: 'mech', cost: { mp: 4, clothing: 1, metal: 4, tools: 2, machinery: 2, rubber: 2 }, builtAt: ['machineryWorkshop', 'machineryFactory'], unlock: 'machineryWorkshop' },
    tank: { name: 'Tank', abbr: 'T', cls: 'land', role: 'combat', hp: 15, move: 4, range: 1, ammo: 2, idle: { food: 1 }, perTile: { fuel: 1.5 }, perTileRound: 'up', repair: 'mech', capture: true, cost: { mp: 4, clothing: 2, smallArms: 2, metal: 10, tools: 4, machinery: 4, rubber: 4 }, builtAt: ['machineryFactory'], unlock: 'machineryFactory' },
    caravan: { name: 'Caravan', abbr: 'Ca', cls: 'land', role: 'logistic', hp: 1, move: 3, idle: { food: 1 }, perTile: {}, repair: 'bio', ford: true, cargo: 20, carry: 0, cost: { mp: 2, clothing: 1, horses: 4, lumber: 4 }, builtAt: ['stables'], unlock: 'stables' },
    supplyTruck: { name: 'Supply truck', abbr: 'ST', cls: 'land', role: 'logistic', hp: 5, move: 4, idle: { food: 1 }, perTile: { fuel: 0.5 }, repair: 'mech', cargo: 40, carry: 2, carryTypes: { infantry: 1, artillery: 2 }, cost: { mp: 2, clothing: 1, metal: 6, tools: 2, machinery: 1, rubber: 2 }, builtAt: ['machineryWorkshop', 'machineryFactory'], unlock: 'machineryWorkshop' },
    train: { name: 'Train', abbr: 'Tr', cls: 'rail', role: 'logistic', hp: 10, move: 6, idle: { fuel: 1 }, perTile: { fuel: 1 }, repair: 'mech', cargo: 120, carry: 4, cost: { mp: 4, clothing: 2, lumber: 4, metal: 12, tools: 4, machinery: 3 }, builtAt: ['machineryWorkshop', 'machineryFactory'], unlock: 'machineryWorkshop' },
    merchantman: { name: 'Merchantman', abbr: 'Me', cls: 'ship', power: 'sail', role: 'logistic', hp: 10, move: 3, idle: { food: 1 }, perTile: { food: 0.5 }, repair: 'sail', cargo: 100, carry: 3, cost: { mp: 4, clothing: 2, cloth: 4, lumber: 16, metal: 2, tools: 2 }, builtAt: ['shipyard'], unlock: 'shipyard' },
    frigate: { name: 'Frigate', abbr: 'Fg', cls: 'ship', power: 'sail', role: 'combat', hp: 25, move: 4, range: 2, ammo: 2, idle: { food: 2 }, perTile: { food: 1 }, repair: 'sail', cost: { mp: 6, clothing: 3, cloth: 6, smallArms: 4, lumber: 20, metal: 4, tools: 4 }, builtAt: ['shipyard'], unlock: 'shipyard' },
    freighter: { name: 'Freighter', abbr: 'Fr', cls: 'ship', power: 'steam', role: 'logistic', hp: 15, move: 5, idle: { food: 1, fuel: 1 }, perTile: { fuel: 1 }, repair: 'mech', cargo: 200, carry: 6, cost: { mp: 4, clothing: 2, lumber: 12, metal: 12, tools: 4, machinery: 2, rubber: 2 }, builtAt: ['navalYard'], unlock: 'navalYard' },
    warship: { name: 'Warship', abbr: 'W', cls: 'ship', power: 'steam', role: 'combat', hp: 50, move: 5, range: 2, ammo: 4, idle: { food: 2, fuel: 1 }, perTile: { fuel: 1 }, repair: 'mech', cost: { mp: 8, clothing: 4, smallArms: 2, lumber: 10, metal: 20, tools: 6, machinery: 5, rubber: 2 }, builtAt: ['navalYard'], unlock: 'navalYard' },
  };

  // Base damage per attack (attacker row -> target column). Missing = cannot attack that target.
  const DAMAGE = {
    infantry: { infantry: 2, cavalry: 2, tank: 2, artillery: 3, caravan: 3, supplyTruck: 5, train: 4, city: 2 },
    cavalry: { infantry: 3, cavalry: 3, tank: 1, artillery: 4, caravan: 4, supplyTruck: 5, train: 2, city: 1 },
    tank: { infantry: 5, cavalry: 4, tank: 5, artillery: 5, caravan: 6, supplyTruck: 8, train: 10, city: 3 },
    artillery: { infantry: 3, cavalry: 2, tank: 4, artillery: 3, caravan: 4, supplyTruck: 5, train: 5, merchantman: 5, frigate: 5, freighter: 5, warship: 5, city: 5 },
    frigate: { infantry: 2, cavalry: 1, artillery: 2, caravan: 3, supplyTruck: 2, train: 1, merchantman: 12, frigate: 10, freighter: 5, warship: 4, city: 2 },
    warship: { infantry: 3, cavalry: 2, tank: 3, artillery: 3, caravan: 4, supplyTruck: 6, train: 10, merchantman: 30, frigate: 30, freighter: 15, warship: 15, city: 5 },
    navalBattery: { merchantman: 30, frigate: 30, freighter: 20, warship: 20 },
    fort: { infantry: 3, cavalry: 3, tank: 4, artillery: 3, caravan: 4, supplyTruck: 4 },
  };
  const WEAPON_AMMO = { fort: 3, navalBattery: 4 }; // per attack, from the city's stockpile
  const WEAPON_RANGE = 2;

  function dmg(attacker, target) {
    const row = DAMAGE[attacker];
    if (!row) return 0;
    if (target === 'city') return row.city || 0;
    return row[target] || 0;
  }

  const CITY = {
    baseStorage: 100, baseHp: 10, hpPerBuilding: 0.5, regenShare: 0.1, healLumber: 1, territory: 2, supplyRadius: 3, maxDepots: 2,
    portRadius: 2, unitSupplyRadius: 2, foundCost: { lumber: 50, food: 50, tools: 20 }, foundMp: 20,
    productionStorageTurns: 3,
  };

  const REPAIR = { field: 2, base: 5 };

  const MAP = {
    tilesPerPlayer: 200,
    sizes: [50, 100, 150, 200, 250, 300, 400, 500],
    type: 'continents',
    types: {
      pangea: 'Pangea: one continent surrounded by ocean',
      continents: 'Continents: three continents surrounded by ocean',
      islands: 'Islands: many modest islands',
      oldNew: 'Old world vs. new world: two long continents, west and east',
      mediterranean: 'Mediterranean: a large central sea ringed by land',
      landlocked: 'Landlocked: no ocean, only rivers and lakes',
      earth: 'Earth: the real continents, roughly',
    },
    // Amounts scale with the map's land tiles (tuned on 12 players x 400 tiles). Rubber and oil are concentrated:
    // most sit in one region away from the capitals, the rest are scattered; at least 1 per 2 players.
    rubber: { landPer: 87, regionShare: 0.7, minPerPlayer: 0.5 },
    oil: { landPer: 63, regionShare: 0.7, minPerPlayer: 0.5 },
    // Silver and gold veins are scattered at random (never clustered); at least 1 of each
    silver: { landPer: 377 },
    gold: { landPer: 660 },
  };

  /* ---------------- War ----------------
     Mobilization is national: peace -> partial (next turn) -> full (3 turns counting the turn it is chosen).
     Going down takes effect when the turn resolves. Ships are unaffected and always cost their full pay. */
  const MOBILIZE = {
    levels: ['peace', 'partial', 'full'],
    toFullTurns: 3,             // partial -> full, counting the turn it is chosen (autocracies: 2)
    partialDamage: -0.5,        // modifier for land combat units at partial mobilization
    partialSpeed: 0.5,          // land combat units move at half speed (rounded down, at least 1)
    fullMpCut: 0.2,             // full mobilization: housing makes 20 percentage points less manpower (added to the tax effect)
  };
  // Credits per combat unit per turn (paid at the end of each turn). Land units by army doctrine and mobilization;
  // ships a flat rate by type. Autocracies pay 25% less for land combat units.
  const PAY = {
    standard: { peace: 50, partial: 100, full: 250 },
    quantity: { peace: 25, partial: 50, full: 150 },
    quality: { peace: 100, partial: 150, full: 350 },
    ship: { frigate: 350, warship: 650 },
    shipDefault: 650,
  };
  const FREE_BERTHS = { barracks: 1, port: 1 }; // per barracks: 1 land unit on the city tile; per city with a harbor/port: 1 ship
  const MANPOWER_DRAW = { land: 0.2, ship: 0.5 }; // manpower per combat unit per turn, wherever it is

  /* ---------------- Government ----------------
     Every nation has a government (all start as monarchies) and a tax rate. The tax rate sets the credits a tax
     office makes per manpower its city's housing produces, and how much manpower that housing produces. */
  const TAX_LEVELS = ['low', 'normal', 'high', 'war'];
  const TAX_NAMES = { low: 'Low', normal: 'Normal', high: 'High', war: 'War tax' };
  const GOVERNMENTS = {
    provisional: {
      loan: { base: 10, slope: 0.25, capMonths: 36 }, // domestic loans: annual base rate %, + slope per 10% of yearly income in debt, total debt cap in months of income
      name: 'Provisional Government', taxEvery: 0, fixedTax: true, notice: 0, toFullTurns: 3,
      tax: { low: { rate: 150, mp: 1.0 }, normal: { rate: 150, mp: 1.0 }, high: { rate: 150, mp: 1.0 }, war: { rate: 150, mp: 1.0 } },
      text: 'Every nation starts here. A fixed normal tax (150 credits per manpower, housing ×1.0), war declared instantly, no other effects. Leaving it causes no upheaval.',
    },
    democracy: {
      loan: { base: 6, slope: 0.15, capMonths: 36 }, // domestic loans: annual base rate %, + slope per 10% of yearly income in debt, total debt cap in months of income
      name: 'Democracy', taxEvery: 6, notice: 4, toFullTurns: 3, rally: true, marketSell: 0.9, science: { credits: 0.75, mp: 2 / 3 },
      tax: { low: { rate: 100, mp: 1.2 }, normal: { rate: 150, mp: 1.1 }, high: { rate: 200, mp: 0.9 }, war: { rate: 250, mp: 0.85 } },
      text: 'Most manpower in peacetime, cheaper research (universities and research facilities cost 25% fewer credits and a third less manpower) and 90% of the price for market sales. War needs 4 turns\' notice (an ultimatum) unless the enemy is at war with an ally (a defensive alliance). If war is declared on it, it reaches full mobilization in 1 turn.',
    },
    monarchy: {
      loan: { base: 8, slope: 0.2, capMonths: 36 }, // domestic loans: annual base rate %, + slope per 10% of yearly income in debt, total debt cap in months of income
      name: 'Monarchy', taxEvery: 4, notice: 1, toFullTurns: 3, settlementCut: 0.25,
      extractionMp: 0.5, // extraction buildings (not silver or gold mines) need half the manpower
      costs: { townHall: { lumber: 23, metal: 8, tools: 6, mp: 3 } }, // town halls about a quarter cheaper
      tax: { low: { rate: 100, mp: 1.1 }, normal: { rate: 150, mp: 1.0 }, high: { rate: 200, mp: 0.95 }, war: { rate: 250, mp: 0.9 } },
      text: 'Holds up best under high and war taxes. War needs 1 turn\'s notice (an ultimatum) unless the enemy is at war with an ally (a defensive alliance). Settlements and town halls cost about 25% less, and extraction buildings (not silver or gold mines) need half the manpower.',
    },
    autocracy: {
      loan: { base: 12, slope: 0.25, capMonths: 36 }, // domestic loans: annual base rate %, + slope per 10% of yearly income in debt, total debt cap in months of income
      name: 'Autocracy', taxEvery: 2, notice: 0, toFullTurns: 2, landPay: 0.75,
      tax: { low: { rate: 130, mp: 1.0 }, normal: { rate: 200, mp: 0.9 }, high: { rate: 250, mp: 0.8 }, war: { rate: 350, mp: 0.75 } },
      text: 'Most credits, least manpower. Declares war instantly, mobilizes in 2 turns, and pays land units 25% less.',
    },
    communism: {
      loan: { base: 15, slope: 0.35, capMonths: 12 }, // domestic loans: annual base rate %, + slope per 10% of yearly income in debt, total debt cap in months of income
      name: 'Communism', taxEvery: 3, notice: 0, toFullTurns: 3, landPay: 0.65, marketSell: 0.6, fullMpCut: 0.1, taxOnUse: true,
      production: { out: 2, mp: 3, inputs: 2.5 }, housing: { out: 1.5, inputs: 2.5 },
      tax: { low: { rate: 65, mp: 1.1 }, normal: { rate: 110, mp: 1.0 }, high: { rate: 150, mp: 0.9 }, war: { rate: 185, mp: 0.85 } },
      text: 'A planned economy: every production and extraction building makes 2× its output but needs 3× the manpower and 2.5× the inputs; housing makes 1.5× the manpower and eats 2.5× the food. Tax offices pay for manpower used in production, not manpower made. Market sales pay only 60%. Land units cost 35% less, full mobilization costs only 10% of manpower, and war is declared instantly.',
    },
  };
  // Loans. Domestic: 12-turn bonds (interest each turn, face value on the last turn), paid before anything else.
  // Income = average tax-office income over the last 12 turns. Rates are annual percentages.
  const LOANS = {
    term: 12, incomeTurns: 12, taxAdj: { low: -1, normal: 0, high: 2, war: 4 }, // tax adjustment, fixed when the loan is taken
    // a loan's rate rises with debt: slope × (debt at the loan's midpoint ÷ yearly income × 10), measured continuously
    defaultFlat: 10, penaltyCap: 30, maxRatePenalty: 30, step: 0.1, // default: +1 point per 10% of yearly income (exact), 1 turn per 10% (rounded up)
    unrestMp: 0.3, unrestGoods: 0.1,
    intl: { maxTerm: 60, maxRate: 100, missedToDefault: 2 },
  };
  // Defensive alliances: 2 turns to answer a call to arms; 3 turns' notice to leave
  const ALLIANCE = { answerTurns: 2, noticeTurns: 3 };
  // History graphs keep 24 turns; the newspaper keeps 12 issues
  const HISTORY = { turns: 24, newsTurns: 12 };
  // Every city pays its nation 100 credits (counted as tax income) and 1 manpower a turn, the manpower scaled like
  // housing by the government and tax rate (a democracy on low tax: 1.2)
  const CITY_INCOME = { credits: 100, mp: 1 };
  // The newspaper: war names, the ad auction, filler stories and the one leak ("scoop") per issue
  const PRESS = {
    warNameMax: 40, adSlots: 3, adMin: 200, adAnon: 150, adMaxChars: 200,
    quietBelow: 4,                // fewer stories than this (market report aside): print a tip and a classified
    recordGain: 0.1, recordGap: 8, recordFrom: 6, recordsPerIssue: 2, // world production records
    priceSwing: 0.25, swingsPerIssue: 2, feverCount: 3,
    salvageNews: 50, salvageShare: 0.1, salvageMin: 10, // salvage of a good makes the paper at 50, or 10% of the world's output of it (at least 10)
  };
  // turn 1 is March: spring is March to May, winter December to February
  const MONTH_NAMES = ['March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February'];
  const PRESS_TIPS = [
    ['Manpower is the true currency', 'Build residences before you need them. An idle factory usually means too few hands, not too few materials.'],
    ['Keep a month of food in every city', 'A city with no food stops its people working. Set a food minimum on the Stockpiles tab and let a recurring purchase top it up.'],
    ['Queue before you travel', 'Away for a few days? Fill each city\'s building queue and set minimum stocks, and your nation keeps building while you are gone.'],
    ['Town halls pay for themselves', 'A town hall widens a city\'s territory. Build it early in any city with good land just out of reach.'],
    ['Railroads change everything', 'Trains carry 120 at a time. Once you can build railroads, link your mines to your factories before anything else.'],
    ['Mind the winter', 'Land units out of supply lose 2 HP a month in winter. Stock your field depots before December.'],
    ['Read your reports', 'Every idle building and every starving unit is listed with the reason. Five minutes with the Reports tab saves a season of waste.'],
    ['The market is not a warehouse', 'Buying at market is quick, but prices climb as the pool empties. A trade route with a neighbour is cheaper for steady needs.'],
    ['Bid what it is worth to you', 'In the market auction you usually pay far less than your top bid: one credit more than the best losing bid.'],
    ['Storage loses goods quietly', 'A full city throws away what it makes. Watch for "output lost to full storage" and build a warehouse.'],
    ['Entrenched infantry is hard to shift', 'Infantry that holds its ground digs in deeper each month. Pick your defensive line and stay on it.'],
    ['Supply decides battles', 'An army fights only as far as its supply reaches. Plan field depots and routes before the first shot.'],
    ['Settlements need provisions', 'A caravan route to a new settlement packs provisions for the round trip. Fill the settlement and it becomes a city.'],
    ['Peace treaties are enforced', 'A promise is only words, but a peace treaty with a term cannot be broken until it ends.'],
    ['An ally is a deterrent', 'A defensive alliance means every attacker must reckon with your friends. A refused call to arms is printed for all to see.'],
    ['Debt is cheapest when small', 'Domestic loans cost more the more you owe. Borrow early and modestly, and pay on time: a default brings unrest.'],
    ['Watch the rankings', 'The Great Powers box shows who leads each field. A nation climbing the army rankings is worth watching.'],
    ['Research what you will build', 'Science is scarce. Unlock the buildings your cities will use next, not the ones that sound grand.'],
    ['Sell blueprints', 'A nation that researches first can sell the blueprint to its neighbours and earn its science back.'],
    ['Specialise your cities', 'A mining city, a factory city and a port each do one thing well. Move goods between them by route.'],
    ['Mobilize with care', 'Full mobilization costs five times peacetime pay and tells the world your plans.'],
    ['Ships need ports', 'Ships repair at a port, and sailing ships at a harbor. A fleet far from home cannot mend.'],
    ['Rivers are highways', 'Ships sail rivers and lakes too. A river city with a harbor is a natural hub.'],
    ['Capture, do not destroy', 'A logistics unit beaten by one of its own kind is captured with most of its cargo. Raid with caravans and trucks.'],
    ['Plan for the second city', 'Space new cities so their territories touch without overlapping. Overlap wastes land you cannot use twice.'],
    ['A tax office in every city', 'Tax offices are your income and your borrowing limit. Few things repay their cost as surely.'],
    ['Check a route\'s capacity', 'If a route says "capacity 120, requested 150", add a transport or shorten the route.'],
    ['Design units for their job', 'A unit design that trades speed for HP holds a line; one that trades HP for damage hits harder.'],
    ['Advertise', 'Three notices are printed each month. Bid on the Newspaper tab and tell the world what you want it to hear.'],
    ['The market report is free intelligence', 'A sudden run on ammunition or steel usually means someone is arming.'],
  ];
  const CLASSIFIEDS = [
    'WANTED: Lumber, in quantity. A sensible nation keeps a month\'s worth in every city. Inquire at your Stockpiles tab.',
    'FOR HIRE: Caravans, sturdy and willing. Will carry provisions to any settlement. Apply at your nearest stables.',
    'LOST: One factory\'s output, to full storage. Finder please build a warehouse.',
    'NOTICE TO GENERALS: Troops fight poorly on empty stomachs. Field depots sold everywhere.',
    'TRAVELLERS: Railroads now connect the finest cities. Lay track today; thank yourself tomorrow.',
    'SITUATION WANTED: Experienced infantry seeks quiet hill to dig into. Will not move.',
    'ATTENTION BUILDERS: Queues accepted, ten to a city. Save for the big one.',
    'BANKERS\' NOTICE: Pay your bonds on time. Unrest is bad for business.',
    'FOR SALE: Blueprints of the finest buildings. Inquire with the nation that researched them first.',
    'WINTER COATS for armies in the field. Order before December.',
    'MATRIMONIAL: Small democracy seeks strong neighbour for defensive alliance. Must answer calls.',
    'MARKET TIP: Bid what the goods are worth to you. You will usually pay much less.',
  ];
  // Standing orders: building queues (per city) and recurring market orders (per nation)
  const QUEUE = { perCity: 10 };
  const RECURRING = { max: 10 };
  const GOV_KEYS = ['provisional', 'democracy', 'monarchy', 'autocracy', 'communism'];
  const GOV_CHANGE = { every: 12, upheavalTurns: 3, upheavalMp: 0.5 }; // for 3 turns after a change, 0.5 comes off the housing multiplier (never below 0)
  // Monarchy settlements: 25% off, rounded to whole goods (forest clearing still costs the normal amount)
  const SETTLEMENT_MONARCHY = { cost: { lumber: 4, tools: 1 }, storage: { lumber: 38, food: 38, tools: 15 }, foundMp: 15 };

  // Combat modifiers are summed, then: damage = base x (1 + sum), never below base x 0.25
  const MODS = { floor: -0.75, unpaid: -0.5, unsupplied: -0.25, helplessCounter: -0.5 };
  const XP = { veteran: 2, elite: 5, bonus: [0, 0.25, 0.5], names: ['Recruit', 'Veteran', 'Elite'] };
  const DOCTRINES = {
    convoys: { group: 'naval', name: 'Naval convoys', era: 2, sci: 6, text: 'Combat ships sharing a tile with your logistics ship: +25% damage. Logistics ships: +25% cargo, +1 unit carried.' },
    navalWarfare: { group: 'naval', name: 'Naval warfare', era: 2, sci: 8, text: 'Combat ships: +50% damage against ships.' },
    bombardment: { group: 'naval', name: 'Naval bombardment', era: 2, sci: 8, text: 'Combat ships: +75% damage against land units and cities.' },
    quantity: { group: 'army', name: 'Quantity', era: 1, sci: 4, text: 'Land combat units: -20% max HP, half idle supply, cheaper pay.' },
    quality: { group: 'army', name: 'Quality', era: 1, sci: 4, text: 'Land combat units: +20% max HP, +15% damage, dearer pay.' },
    entrenchment: { group: 'warfare', name: 'Entrenchment', era: 2, sci: 6, text: 'At full mobilization, infantry dig in one level for each turn in a row they do not move (up to 5): -10% damage taken per level (tanks ignore this and deal +25%). Entrenched infantry deal +25% damage, +50% to cavalry.' },
    mobileWarfare: { group: 'warfare', name: 'Mobile warfare', era: 3, sci: 10, text: 'At full mobilization: tanks, artillery, trains and supply trucks +1 move; tanks and artillery that moved last turn +25% damage.' },
  };
  const DOCTRINE_GROUPS = { naval: 'Naval', army: 'Army size', warfare: 'Warfare' };
  const ENTRENCH = { max: 5, perLevel: 0.1, fire: 0.25, vsCavalry: 0.5, tankBonus: 0.25 };
  const DOCTRINE_LOCK = 10;
  const QUALITY_DAMAGE = 0.15;
  const SUMMER_FARM = 1.5; // farms of every tier make 50% more in summer (months 4-6), applied last
  const WINTER_ATTRITION = 2; // HP a land unit out of supply loses per winter turn (1 the rest of the year)
  const CAPTURE_CARGO = 0.75; // share of cargo kept when a logistics unit is captured
  // Unit designs: named variants with steps on HP, speed, damage (combat units) and cargo (logistics units).
  // Per step, + / - : build cost, idle upkeep, per-tile upkeep and move. Cargo - steps give speed but no discount;
  // HP - steps give a discount but no speed. Repairs cost repairShare of the build cost, in proportion to HP restored.
  const DESIGN = {
    sci: 3, ranges: { hp: [-2, 3], speed: [-2, 3], dmg: [-2, 3], cargo: [-2, 3] },
    hpStep: 0.2, dmgStep: 0.15, cargoStep: 0.25, ammoUp: 0.25, ammoDown: 0.1, repairShare: 0.5,
    build: { hp: [0.15, 0.10], speed: [0.15, 0.10], dmg: [0.15, 0.10], cargo: [0.15, 0] },
    idle: { hp: [0, 0], speed: [0.10, 0.10], dmg: [0.10, 0.10], cargo: [0.10, 0] },
    perTile: { hp: [0.15, 0.15], speed: [0.25, 0.15], dmg: [0, 0], cargo: [0, 0] },
  };
  // Combat units carry their own stores: 2 turns of supply at full speed and ammo for 2 attacks
  const UNIT_STORE = { turns: 2, attacks: 2 };
  // A settlement becomes a city once it holds a city's founding goods
  const SETTLEMENT = { storage: { lumber: 50, food: 50, tools: 20 }, tiles: ['grassland', 'forest'] };
  // Lumber a building in the city itself uses each turn it runs
  const CITY_RUN_LUMBER = 0.5;
  const SUPPLY_PRIORITY = ['tank', 'artillery', 'infantry', 'cavalry', 'warship', 'frigate'];
  const DEPOT = { storage: { food: 200, fuel: 200, ammo: 200 }, other: 50, supplyRange: 3 };
  // Share of a destroyed logistics unit's cargo that goes to the nation that destroyed it
  const LOOT = 0.5;
  const PLAYERS = { min: 4, max: 12 };
  const MINE_LABOR = 2; // workers a new silver or gold mine starts with

  const STACK = { logistics: 2 }; // per tile, besides one combat unit (city tiles are exempt)
  const DEMOLISH = { mp: 2, refund: 0.5 };
  const PEACE = { minTerm: 0, maxTerm: 15 };

  const START = { stock: { lumber: 65, food: 50, ore: 30, metal: 30, tools: 30 }, credits: 15000, manpower: 30 };

  // Clearing a forest tile inside a city's territory: it becomes grassland.
  const CLEAR_FOREST = { tools: 1, mp: 2, lumber: 30 };

  const DEFAULT_PRIORITY = [
    'farm', 'farm2', 'farm3', 'fishery', 'fishery2', 'fishery3', 'residence', 'apartment', 'highrise',
    'lumberYard', 'lumberYard2', 'lumberYard3', 'oreMine', 'oreMine2', 'oreMine3', 'coalMine', 'coalMine2', 'coalMine3', 'charcoalRefinery', 'oilField',
    'fiberFarm', 'fiberFarm2', 'fiberFarm3', 'rubberPlantation', 'rubberPlantation2', 'rubberPlantation3', 'rubberWorks', 'rubberRefinery', 'stables',
    'metalForge', 'metalFactory', 'workshop', 'toolsFactory', 'smallArmsFactory', 'ammoFactory',
    'textileWorkshop', 'clothFactory', 'clothingFactory', 'machineryWorkshop', 'machineryFactory', 'university', 'researchFacility', 'taxOffice', 'silverMine', 'goldMine',
  ];

  const PLAYER_COLORS = ['#d7263d', '#1b998b', '#3a6ea5', '#f49d37', '#7b2cbf', '#e0c341', '#ff6f91', '#2e4057', '#8cb369', '#a0522d', '#00b4d8', '#b8b8ff'];

  const ERA_NAMES = { 1: 'Foundations', 2: 'Steel and Steam', 3: 'Industry' };

  return {
    GOODS, GOOD_NAMES, GOOD_COLORS, BASE_PRICE, MARKET, SPECIAL_STORAGE, TILES, BUILDINGS, UNITS, DAMAGE, WEAPON_AMMO, WEAPON_RANGE,
    dmg, CITY, REPAIR, MAP, PAY, LOOT, PLAYERS, MINE_LABOR, MOBILIZE, FREE_BERTHS, MANPOWER_DRAW, TAX_LEVELS, TAX_NAMES, GOVERNMENTS, GOV_KEYS, GOV_CHANGE, QUEUE, RECURRING, LOANS, ALLIANCE, HISTORY, CITY_INCOME, PRESS, MONTH_NAMES, PRESS_TIPS, CLASSIFIEDS, SETTLEMENT_MONARCHY, MODS, XP, DOCTRINES, DOCTRINE_GROUPS, DOCTRINE_LOCK, QUALITY_DAMAGE, WINTER_ATTRITION, SUMMER_FARM, CAPTURE_CARGO, DESIGN, ENTRENCH, UNIT_STORE, SETTLEMENT, CITY_RUN_LUMBER, SUPPLY_PRIORITY, DEPOT, TIERS, STACK, DEMOLISH, PEACE, START, CLEAR_FOREST, DEFAULT_PRIORITY, PLAYER_COLORS, ERA_NAMES,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RULES;
