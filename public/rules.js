/* =====================================================================
   SUPPLY LINES — RULES DATA
   Every number in the game lives here, so balance changes only need
   edits in this file.
   ===================================================================== */
const RULES = (() => {
  const GOODS = ['food', 'lumber', 'ore', 'fuel', 'fiber', 'rubber', 'horses', 'metal', 'cloth', 'clothing', 'tools', 'smallArms', 'ammo', 'machinery'];

  const GOOD_NAMES = {
    food: 'Food', lumber: 'Lumber', ore: 'Ore', fuel: 'Fuel', fiber: 'Fiber', rubber: 'Rubber', horses: 'Horses',
    metal: 'Metal', cloth: 'Cloth', clothing: 'Clothing', tools: 'Tools', smallArms: 'Small arms', ammo: 'Ammo', machinery: 'Machinery',
  };

  const GOOD_COLORS = {
    food: '#d9a521', lumber: '#9a6534', ore: '#8c96a1', fuel: '#454545', fiber: '#c9bf9b', rubber: '#3f8a57', horses: '#7c4f32',
    metal: '#6f8aa8', cloth: '#c98fb6', clothing: '#a44b7d', tools: '#4f74c8', smallArms: '#b8433f', ammo: '#d8702f', machinery: '#6a4cae',
  };

  // Global market (credits)
  const BASE_PRICE = {
    food: 200, lumber: 200, ore: 300, fiber: 300, fuel: 400, horses: 600, rubber: 600, ammo: 600,
    cloth: 800, metal: 1000, clothing: 1000, tools: 1400, smallArms: 1400, machinery: 4000,
  };
  // trickle: share of each turn's world production of goods that appears in the market pool (no one loses anything)
  const MARKET = { scale: 4, buyRatio: 0.8, trickle: 0.05 };

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
    farm: { name: 'Farm', abbr: 'Fm', era: 1, sci: 0, place: 'tile', tiles: ['grassland'], cost: { lumber: 6, tools: 2, mp: 1 }, recipes: { food: { mp: 1, out: { food: 10 } } }, waterBonus: 3 },
    fishery: { name: 'Fishery', abbr: 'Fs', era: 1, sci: 2, place: 'tile', tiles: ['lake', 'ocean'], cost: { lumber: 6, tools: 2, mp: 1 }, recipes: { food: { mp: 1, out: { food: 6 } } }, oceanFood: 10 },
    fiberFarm: { name: 'Fiber farm', abbr: 'Fb', era: 1, sci: 2, place: 'tile', tiles: ['grassland'], cost: { lumber: 6, tools: 2, mp: 1 }, recipes: { fiber: { mp: 1, out: { fiber: 6 } } } },
    rubberPlantation: { name: 'Rubber plantation', abbr: 'Rb', era: 1, sci: 3, place: 'tile', tiles: ['rubber'], cost: { lumber: 8, tools: 2, mp: 1 }, recipes: { rubber: { mp: 1, out: { rubber: 4 } } } },
    stables: { name: 'Stables', abbr: 'St', era: 1, sci: 3, place: 'tile', tiles: ['grassland'], cost: { lumber: 10, tools: 2, mp: 1 }, recipes: { horses: { mp: 1, in: { food: 3 }, out: { horses: 3 } } } },
    lumberYard: { name: 'Lumber yard', abbr: 'Lm', era: 1, sci: 0, place: 'tile', tiles: ['forest'], cost: { lumber: 4, tools: 2, mp: 1 }, recipes: { lumber: { mp: 1, out: { lumber: 8 } } }, riverBonus: 0.5, railBonus: 2 },
    oreMine: { name: 'Ore mine', abbr: 'Om', era: 1, sci: 0, place: 'tile', tiles: ['ore'], cost: { lumber: 8, tools: 4, mp: 2 }, recipes: { ore: { mp: 1, out: { ore: 6 } } }, railBonus: 2 },
    // Silver and gold mines turn manpower into credits: assign workers (manpower per turn) up to maxLabor.
    silverMine: { name: 'Silver mine', abbr: 'Ag', era: 1, sci: 2, place: 'tile', tiles: ['silver'], cost: { lumber: 8, tools: 4, mp: 2 }, recipes: { credits: { labor: true, creditsPerMp: 500, maxLabor: 15 } } },
    goldMine: { name: 'Gold mine', abbr: 'Au', era: 1, sci: 3, place: 'tile', tiles: ['gold'], cost: { lumber: 10, metal: 4, tools: 6, mp: 3 }, recipes: { credits: { labor: true, creditsPerMp: 1000, maxLabor: 10 } } },
    coalMine: { name: 'Coal mine', abbr: 'Cm', era: 1, sci: 0, place: 'tile', tiles: ['coal'], cost: { lumber: 8, tools: 4, mp: 2 }, recipes: { fuel: { mp: 1, out: { fuel: 6 } } }, railBonus: 2 },
    charcoalRefinery: { name: 'Charcoal refinery', abbr: 'Ch', era: 1, sci: 2, place: 'tile', tiles: ['grassland'], cost: { lumber: 8, tools: 3, mp: 2 }, recipes: { fuel: { mp: 1, in: { lumber: 3 }, out: { fuel: 1 } } } },
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
        ammo: { mp: 2, in: { metal: 1 }, out: { ammo: 3 } },
      },
    },
    textileWorkshop: {
      name: 'Textile workshop', era: 1, sci: 4, place: 'city', cost: { lumber: 8, tools: 4, mp: 2 },
      recipes: { cloth: { mp: 2, in: { fiber: 3 }, out: { cloth: 2 } }, clothing: { mp: 2, in: { cloth: 2 }, out: { clothing: 2 } } },
    },
    machineryWorkshop: { name: 'Machinery workshop', era: 2, sci: 8, place: 'city', cost: { lumber: 10, metal: 8, tools: 6, mp: 3 }, recipes: { machinery: { mp: 2, in: { metal: 3, tools: 2, fuel: 1 }, out: { machinery: 1 } } }, builds: ['artillery', 'train', 'supplyTruck'] },
    metalFactory: { name: 'Metal factory', era: 3, sci: 10, place: 'city', cost: { lumber: 15, metal: 20, tools: 10, machinery: 5, mp: 4 }, recipes: { metal: { mp: 4, in: { ore: 6, fuel: 2 }, out: { metal: 6 } } }, riverMpLess: 1 },
    toolsFactory: { name: 'Tools factory', era: 3, sci: 10, place: 'city', cost: { lumber: 15, metal: 20, tools: 10, machinery: 5, mp: 4 }, recipes: { tools: { mp: 4, in: { metal: 4, lumber: 2 }, out: { tools: 6 } } }, riverMpLess: 1 },
    smallArmsFactory: { name: 'Small arms factory', era: 3, sci: 10, place: 'city', cost: { lumber: 15, metal: 20, tools: 10, machinery: 5, rubber: 2, mp: 4 }, recipes: { smallArms: { mp: 4, in: { metal: 4, lumber: 2 }, out: { smallArms: 6 } } }, riverMpLess: 1 },
    ammoFactory: { name: 'Ammo factory', era: 3, sci: 10, place: 'city', cost: { lumber: 15, metal: 20, tools: 10, machinery: 5, rubber: 2, mp: 4 }, recipes: { ammo: { mp: 4, in: { metal: 2 }, out: { ammo: 10 } } }, riverMpLess: 1 },
    clothFactory: { name: 'Cloth factory', era: 3, sci: 8, place: 'city', cost: { lumber: 15, metal: 15, tools: 8, machinery: 3, mp: 4 }, recipes: { cloth: { mp: 4, in: { fiber: 4 }, out: { cloth: 4 } } }, riverMpLess: 1 },
    clothingFactory: { name: 'Clothing factory', era: 3, sci: 8, place: 'city', cost: { lumber: 15, metal: 15, tools: 8, machinery: 3, mp: 4 }, recipes: { clothing: { mp: 4, in: { cloth: 2 }, out: { clothing: 4 } } }, riverMpLess: 1 },
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
    fieldDepot: { name: 'Field depot', abbr: 'FD', era: 1, sci: 2, place: 'depot', cost: { lumber: 20, tools: 4, mp: 2 } },

    walls: { name: 'Walls', era: 1, sci: 4, place: 'city', limit: 1, cost: { lumber: 15, metal: 5, tools: 4, mp: 3 }, hp: 10 },
    fort: { name: 'Fort', era: 3, sci: 12, place: 'city', limit: 1, cost: { lumber: 30, metal: 30, tools: 12, machinery: 3, mp: 6 }, hp: 20, weapon: true },
    navalBattery: { name: 'Naval battery', era: 2, sci: 8, place: 'city', limit: 1, needsWater: true, cost: { lumber: 20, metal: 30, tools: 12, machinery: 8, mp: 6 }, hp: 10, weapon: true },
    tankTrap: { name: 'Tank trap', abbr: 'TT', era: 3, sci: 8, place: 'tile', tiles: 'anyLand', limit: 1, cost: { metal: 6, tools: 2, mp: 1 } },
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
    cavalry: { name: 'Cavalry', abbr: 'C', cls: 'land', role: 'combat', hp: 7, move: 3, range: 1, ammo: 1, idle: { food: 2 }, perTile: { food: 1 }, repair: 'bio', repairHorses: 3, capture: true, ford: true, cost: { mp: 4, clothing: 2, smallArms: 2, horses: 3 }, builtAt: ['barracks'], unlock: 'stables' },
    artillery: { name: 'Artillery', abbr: 'A', cls: 'land', role: 'combat', hp: 5, move: 2, range: 2, ammo: 3, idle: { food: 1 }, perTile: { fuel: 1 }, repair: 'mech', cost: { mp: 4, clothing: 2, metal: 4, tools: 2, machinery: 2, rubber: 2 }, builtAt: ['machineryWorkshop', 'machineryFactory'], unlock: 'machineryWorkshop' },
    tank: { name: 'Tank', abbr: 'T', cls: 'land', role: 'combat', hp: 15, move: 4, range: 1, ammo: 2, idle: { food: 1 }, perTile: { fuel: 1.5 }, perTileRound: 'up', repair: 'mech', capture: true, cost: { mp: 6, clothing: 3, metal: 10, tools: 4, machinery: 4, rubber: 4 }, builtAt: ['machineryFactory'], unlock: 'machineryFactory' },
    caravan: { name: 'Caravan', abbr: 'Ca', cls: 'land', role: 'logistic', hp: 1, move: 3, idle: { food: 1 }, perTile: {}, repair: 'bio', ford: true, cargo: 20, carry: 0, cost: { mp: 2, clothing: 1, horses: 4, lumber: 4 }, builtAt: ['stables'], unlock: 'stables' },
    supplyTruck: { name: 'Supply truck', abbr: 'ST', cls: 'land', role: 'logistic', hp: 5, move: 4, idle: { food: 1 }, perTile: { fuel: 0.5 }, repair: 'mech', cargo: 40, carry: 2, carryTypes: { infantry: 1, artillery: 2 }, cost: { mp: 2, clothing: 1, metal: 6, tools: 2, machinery: 1, rubber: 2 }, builtAt: ['machineryWorkshop', 'machineryFactory'], unlock: 'machineryWorkshop' },
    train: { name: 'Train', abbr: 'Tr', cls: 'rail', role: 'logistic', hp: 10, move: 6, idle: { fuel: 1 }, perTile: { fuel: 1 }, repair: 'mech', cargo: 120, carry: 4, cost: { mp: 4, clothing: 2, lumber: 4, metal: 12, tools: 4, machinery: 3 }, builtAt: ['machineryWorkshop', 'machineryFactory'], unlock: 'machineryWorkshop' },
    merchantman: { name: 'Merchantman', abbr: 'Me', cls: 'ship', power: 'sail', role: 'logistic', hp: 10, move: 3, idle: { food: 1 }, perTile: { food: 0.5 }, repair: 'sail', cargo: 100, carry: 3, cost: { mp: 4, clothing: 2, cloth: 6, lumber: 16, metal: 2, tools: 2 }, builtAt: ['shipyard'], unlock: 'shipyard' },
    frigate: { name: 'Frigate', abbr: 'Fg', cls: 'ship', power: 'sail', role: 'combat', hp: 25, move: 4, range: 2, ammo: 2, idle: { food: 2 }, perTile: { food: 1 }, repair: 'sail', cost: { mp: 6, clothing: 3, cloth: 8, smallArms: 4, lumber: 20, metal: 4, tools: 4 }, builtAt: ['shipyard'], unlock: 'shipyard' },
    freighter: { name: 'Freighter', abbr: 'Fr', cls: 'ship', power: 'steam', role: 'logistic', hp: 15, move: 5, idle: { food: 1, fuel: 1 }, perTile: { fuel: 1 }, repair: 'mech', cargo: 200, carry: 6, cost: { mp: 6, clothing: 3, lumber: 12, metal: 8, tools: 4, machinery: 2 }, builtAt: ['navalYard'], unlock: 'navalYard' },
    warship: { name: 'Warship', abbr: 'W', cls: 'ship', power: 'steam', role: 'combat', hp: 50, move: 5, range: 2, ammo: 4, idle: { food: 2, fuel: 1 }, perTile: { fuel: 1 }, repair: 'mech', cost: { mp: 10, clothing: 5, lumber: 10, metal: 20, tools: 6, machinery: 5 }, builtAt: ['navalYard'], unlock: 'navalYard' },
  };

  // Damage per attack. Rows = attacker, columns = target. Missing = cannot hit.
  const DAMAGE = {
    infantry: { infantry: 2, cavalry: 3, tank: 2, artillery: 3, train: 3, city: 1 },
    cavalry: { infantry: 3, cavalry: 3, tank: 1, artillery: 4, train: 4, city: 1 },
    tank: { infantry: 4, cavalry: 5, tank: 5, artillery: 5, train: 5, city: 3 },
    artillery: { infantry: 3, cavalry: 2, tank: 4, artillery: 3, train: 5, merchantman: 3, frigate: 3, freighter: 3, warship: 3, city: 4 },
    frigate: { infantry: 2, cavalry: 1, tank: 1, artillery: 2, train: 2, merchantman: 10, frigate: 6, freighter: 8, warship: 4, city: 2 },
    warship: { infantry: 3, cavalry: 2, tank: 3, artillery: 3, train: 4, merchantman: 15, frigate: 15, freighter: 15, warship: 10, city: 4 },
    navalBattery: { merchantman: 20, frigate: 20, freighter: 20, warship: 20 },
    fort: { infantry: 3, cavalry: 3, tank: 2, artillery: 3 },
  };
  const WEAPON_AMMO = 2; // forts and naval batteries, from the city's stockpile
  const WEAPON_RANGE = 2;

  function dmg(attacker, target) {
    const row = DAMAGE[attacker];
    if (!row) return 0;
    if (target === 'city') return row.city || 0;
    if (target === 'caravan') return row.infantry ? 1 : 0; // 1 HP: any hit that can reach land units destroys it
    if (target === 'supplyTruck') return attacker === 'fort' ? 3 : (row.train || 0);
    return row[target] || 0;
  }

  const CITY = {
    baseStorage: 100, baseHp: 10, regen: 2, territory: 2, supplyRadius: 3, maxDepots: 2,
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
    toFullTurns: 3,             // partial -> full, counting the turn it is chosen
    partialDamage: -0.5,        // modifier for land combat units at partial mobilization
    partialSpeed: 0.5,          // land combat units move at half speed (rounded down, at least 1)
    fullHousingCut: 1 / 3,      // housing makes a third less manpower at full mobilization
  };
  // Credits per combat unit per turn, by doctrine and mobilization (paid at the end of each turn)
  const PAY = {
    standard: { peace: 10, partial: 20, full: 50 },
    quantity: { peace: 5, partial: 10, full: 30 },
    quality: { peace: 20, partial: 30, full: 70 },
    ship: 100,
  };
  const FREE_BERTHS = { barracks: 1, port: 1 }; // per barracks: 1 land unit on the city tile; per city with a harbor/port: 1 ship
  const MANPOWER_DRAW = 0.1;    // manpower per combat unit per turn, wherever it is
  // Combat modifiers are summed, then: damage = base x (1 + sum), never below base x 0.25
  const MODS = { floor: -0.75, unpaid: -0.5, unsupplied: -0.25, helplessCounter: -0.5 };
  const XP = { veteran: 2, elite: 5, bonus: [0, 0.25, 0.5], names: ['Recruit', 'Veteran', 'Elite'] };
  const DOCTRINES = {
    convoys: { group: 'naval', name: 'Naval convoys', era: 2, sci: 6, text: 'Combat ships sharing a tile with your logistics ship: +25% damage. Logistics ships: +25% cargo, +1 unit carried.' },
    navalWarfare: { group: 'naval', name: 'Naval warfare', era: 2, sci: 8, text: 'Combat ships: +50% damage against ships.' },
    bombardment: { group: 'naval', name: 'Naval bombardment', era: 2, sci: 8, text: 'Combat ships: +75% damage against land units and cities.' },
    quantity: { group: 'army', name: 'Quantity', era: 1, sci: 4, text: 'Land combat units: -20% max HP, half idle supply, cheaper pay.' },
    quality: { group: 'army', name: 'Quality', era: 1, sci: 4, text: 'Land combat units: +20% max HP, +1 move, dearer pay.' },
    entrenchment: { group: 'warfare', name: 'Entrenchment', era: 2, sci: 6, text: 'Infantry that did not move last turn and has no move order, at full mobilization, is entrenched: -25% damage from infantry, cavalry and artillery, +25% from tanks, +50% damage to cavalry.' },
    mobileWarfare: { group: 'warfare', name: 'Mobile warfare', era: 3, sci: 10, text: 'Tanks, artillery, trains and supply trucks: +1 move. Tanks and artillery that moved last turn: +25% damage.' },
  };
  const DOCTRINE_GROUPS = { naval: 'Naval', army: 'Army size', warfare: 'Warfare' };
  const DOCTRINE_LOCK = 10;
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
    'fiberFarm', 'fiberFarm2', 'fiberFarm3', 'rubberPlantation', 'rubberPlantation2', 'rubberPlantation3', 'stables',
    'metalForge', 'metalFactory', 'workshop', 'toolsFactory', 'smallArmsFactory', 'ammoFactory',
    'textileWorkshop', 'clothFactory', 'clothingFactory', 'machineryWorkshop', 'machineryFactory', 'university', 'researchFacility', 'taxOffice', 'silverMine', 'goldMine',
  ];

  const PLAYER_COLORS = ['#d7263d', '#1b998b', '#3a6ea5', '#f49d37', '#7b2cbf', '#e0c341', '#ff6f91', '#2e4057', '#8cb369', '#a0522d', '#00b4d8', '#b8b8ff'];

  const ERA_NAMES = { 1: 'Foundations', 2: 'Steel and Steam', 3: 'Industry' };

  return {
    GOODS, GOOD_NAMES, GOOD_COLORS, BASE_PRICE, MARKET, SPECIAL_STORAGE, TILES, BUILDINGS, UNITS, DAMAGE, WEAPON_AMMO, WEAPON_RANGE,
    dmg, CITY, REPAIR, MAP, PAY, LOOT, PLAYERS, MINE_LABOR, MOBILIZE, FREE_BERTHS, MANPOWER_DRAW, MODS, XP, DOCTRINES, DOCTRINE_GROUPS, DOCTRINE_LOCK, SUPPLY_PRIORITY, DEPOT, TIERS, STACK, DEMOLISH, PEACE, START, CLEAR_FOREST, DEFAULT_PRIORITY, PLAYER_COLORS, ERA_NAMES,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RULES;
