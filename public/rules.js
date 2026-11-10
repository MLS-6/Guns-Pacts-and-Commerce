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
    food: 100, lumber: 100, ore: 150, fiber: 150, fuel: 200, horses: 300, rubber: 300, ammo: 300,
    cloth: 400, metal: 500, clothing: 500, tools: 700, smallArms: 700, machinery: 2000,
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
     riverFuel: extra fuel per turn it runs when its city is next to a river
     recipes: what the building does each turn it operates
       mp = manpower used, in = goods used, out = goods made,
       mpOut / sciOut / creditsOut = national resources made, credits = credits used
       creditsPerResidence = credits for each residence in the same city that worked this turn */
  const BUILDINGS = {
    residence: { name: 'Residence', era: 1, sci: 0, place: 'city', cost: { lumber: 10, tools: 2, mp: 2 }, recipes: { manpower: { in: { food: 3 }, mpOut: 3 } } },
    farm: { name: 'Farm', abbr: 'Fm', era: 1, sci: 0, place: 'tile', tiles: ['grassland'], cost: { lumber: 6, tools: 2, mp: 1 }, recipes: { food: { mp: 1, out: { food: 10 } } }, waterBonus: 3 },
    fishery: { name: 'Fishery', abbr: 'Fs', era: 1, sci: 2, place: 'tile', tiles: ['lake', 'ocean'], cost: { lumber: 6, tools: 2, mp: 1 }, recipes: { food: { mp: 1, out: { food: 6 } } }, oceanFood: 10 },
    fiberFarm: { name: 'Fiber farm', abbr: 'Fb', era: 1, sci: 2, place: 'tile', tiles: ['grassland'], cost: { lumber: 6, tools: 2, mp: 1 }, recipes: { fiber: { mp: 1, out: { fiber: 6 } } } },
    rubberPlantation: { name: 'Rubber plantation', abbr: 'Rb', era: 1, sci: 3, place: 'tile', tiles: ['rubber'], cost: { lumber: 8, tools: 2, mp: 1 }, recipes: { rubber: { mp: 1, out: { rubber: 4 } } } },
    stables: { name: 'Stables', abbr: 'St', era: 1, sci: 3, place: 'tile', tiles: ['grassland'], cost: { lumber: 10, tools: 2, mp: 1 }, recipes: { horses: { mp: 1, in: { food: 3 }, out: { horses: 3 } } } },
    lumberYard: { name: 'Lumber yard', abbr: 'Lm', era: 1, sci: 0, place: 'tile', tiles: ['forest'], cost: { lumber: 4, tools: 2, mp: 1 }, recipes: { lumber: { mp: 1, out: { lumber: 8 } } }, riverMult: 1.5 },
    oreMine: { name: 'Ore mine', abbr: 'Om', era: 1, sci: 0, place: 'tile', tiles: ['ore'], cost: { lumber: 8, tools: 4, mp: 2 }, recipes: { ore: { mp: 1, out: { ore: 6 } } } },
    coalMine: { name: 'Coal mine', abbr: 'Cm', era: 1, sci: 0, place: 'tile', tiles: ['coal'], cost: { lumber: 8, tools: 4, mp: 2 }, recipes: { fuel: { mp: 1, out: { fuel: 6 } } } },
    charcoalRefinery: { name: 'Charcoal refinery', abbr: 'Ch', era: 1, sci: 2, place: 'tile', tiles: ['grassland'], cost: { lumber: 8, tools: 3, mp: 2 }, recipes: { fuel: { mp: 1, in: { lumber: 3 }, out: { fuel: 1 } } } },
    oilField: { name: 'Oil field', abbr: 'Ol', era: 3, sci: 12, place: 'tile', tiles: ['oil'], cost: { lumber: 4, metal: 10, tools: 6, machinery: 4, rubber: 4, mp: 4 }, recipes: { fuel: { mp: 2, out: { fuel: 15 } } } },

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
    metalFactory: { name: 'Metal factory', era: 3, sci: 10, place: 'city', cost: { lumber: 15, metal: 20, tools: 10, machinery: 5, mp: 4 }, recipes: { metal: { mp: 4, in: { ore: 6, fuel: 2 }, out: { metal: 6 } } } , riverFuel: 1 },
    toolsFactory: { name: 'Tools factory', era: 3, sci: 10, place: 'city', cost: { lumber: 15, metal: 20, tools: 10, machinery: 5, mp: 4 }, recipes: { tools: { mp: 4, in: { metal: 4, lumber: 2 }, out: { tools: 6 } } } , riverFuel: 1 },
    smallArmsFactory: { name: 'Small arms factory', era: 3, sci: 10, place: 'city', cost: { lumber: 15, metal: 20, tools: 10, machinery: 5, rubber: 2, mp: 4 }, recipes: { smallArms: { mp: 4, in: { metal: 4, lumber: 2 }, out: { smallArms: 6 } } } , riverFuel: 1 },
    ammoFactory: { name: 'Ammo factory', era: 3, sci: 10, place: 'city', cost: { lumber: 15, metal: 20, tools: 10, machinery: 5, rubber: 2, mp: 4 }, recipes: { ammo: { mp: 4, in: { metal: 2 }, out: { ammo: 10 } } } , riverFuel: 1 },
    clothFactory: { name: 'Cloth factory', era: 3, sci: 8, place: 'city', cost: { lumber: 15, metal: 15, tools: 8, machinery: 3, mp: 4 }, recipes: { cloth: { mp: 4, in: { fiber: 4 }, out: { cloth: 4 } } } , riverFuel: 1 },
    clothingFactory: { name: 'Clothing factory', era: 3, sci: 8, place: 'city', cost: { lumber: 15, metal: 15, tools: 8, machinery: 3, mp: 4 }, recipes: { clothing: { mp: 4, in: { cloth: 2 }, out: { clothing: 4 } } } , riverFuel: 1 },
    machineryFactory: { name: 'Machinery factory', era: 3, sci: 15, place: 'city', cost: { lumber: 15, metal: 25, tools: 12, machinery: 6, rubber: 6, mp: 5 }, recipes: { machinery: { mp: 4, in: { metal: 4, tools: 2, fuel: 1 }, out: { machinery: 3 } } }, builds: ['artillery', 'tank', 'train', 'supplyTruck'] , riverFuel: 1 },

    university: { name: 'University', era: 1, sci: 0, place: 'city', cost: { lumber: 12, metal: 4, tools: 6, mp: 3 }, recipes: { science: { mp: 6, credits: 50, sciOut: 1 } } },
    taxOffice: { name: 'Tax office', era: 1, sci: 3, place: 'city', limit: 1, cost: { lumber: 20, metal: 6, tools: 6, mp: 3 }, recipes: { credits: { creditsPerResidence: 20 } } },
    townHall: { name: 'Town hall', era: 1, sci: 4, place: 'city', limit: 1, cost: { lumber: 30, metal: 10, tools: 8, mp: 4 }, territoryBonus: 1 },

    barracks: { name: 'Barracks', era: 1, sci: 0, place: 'city', cost: { lumber: 12, metal: 4, tools: 4, mp: 2 }, builds: ['infantry', 'cavalry'] },
    harbor: { name: 'Harbor', era: 1, sci: 3, place: 'city', needsWater: true, cost: { lumber: 15, tools: 4, mp: 2 }, dock: 'sail' },
    port: { name: 'Port', era: 2, sci: 6, place: 'city', needsWater: true, cost: { lumber: 20, metal: 10, tools: 6, rubber: 4, mp: 3 }, dock: 'all' },
    shipyard: { name: 'Shipyard', era: 1, sci: 5, place: 'city', needsWater: true, cost: { lumber: 20, metal: 4, tools: 6, mp: 3 }, builds: ['merchantman', 'frigate'] },
    navalYard: { name: 'Naval yard', era: 2, sci: 10, place: 'city', needsWater: true, cost: { lumber: 20, metal: 20, tools: 10, machinery: 4, rubber: 6, mp: 4 }, builds: ['freighter', 'warship'] },

    railroad: { name: 'Railroad', abbr: 'Rail', era: 2, sci: 6, place: 'infra', cost: { lumber: 2, metal: 4, tools: 1, mp: 1 } },
    bridge: { name: 'Bridge', abbr: 'Br', era: 2, sci: 5, place: 'infra', cost: { lumber: 15, metal: 10, tools: 6, mp: 3 } },
    railBridge: { name: 'Rail bridge', abbr: 'RB', era: 2, sci: 6, place: 'infra', cost: { lumber: 17, metal: 14, tools: 7, mp: 4 } },

    walls: { name: 'Walls', era: 1, sci: 4, place: 'city', limit: 1, cost: { lumber: 15, metal: 5, tools: 4, mp: 3 }, hp: 10 },
    fort: { name: 'Fort', era: 3, sci: 12, place: 'city', limit: 1, cost: { lumber: 30, metal: 30, tools: 12, machinery: 3, mp: 6 }, hp: 20, weapon: true },
    navalBattery: { name: 'Naval battery', era: 2, sci: 8, place: 'city', limit: 1, needsWater: true, cost: { lumber: 20, metal: 30, tools: 12, machinery: 8, mp: 6 }, hp: 10, weapon: true },
    tankTrap: { name: 'Tank trap', abbr: 'TT', era: 3, sci: 8, place: 'tile', tiles: 'anyLand', limit: 1, cost: { metal: 6, tools: 2, mp: 1 } },
  };

  /* Units
     cls: 'land' | 'rail' | 'ship'     role: 'combat' | 'logistic'
     idle = upkeep every turn outside a barracks/port, perTile = extra per tile moved
     repair: 'bio' (manpower), 'mech' (metal + tools), 'sail' (lumber); repairHorses = 1 horse per N HP
     carryTypes: which units a transport may carry and how many slots each takes */
  const UNITS = {
    infantry: { name: 'Infantry', abbr: 'I', cls: 'land', role: 'combat', hp: 5, move: 2, range: 1, ammo: 1, idle: { food: 1 }, perTile: { food: 1 }, repair: 'bio', capture: true, cost: { mp: 4, clothing: 2, smallArms: 2 }, builtAt: ['barracks'], unlock: 'barracks' },
    cavalry: { name: 'Cavalry', abbr: 'C', cls: 'land', role: 'combat', hp: 7, move: 3, range: 1, ammo: 1, idle: { food: 2 }, perTile: { food: 1 }, repair: 'bio', repairHorses: 3, capture: true, cost: { mp: 4, clothing: 2, smallArms: 2, horses: 3 }, builtAt: ['barracks'], unlock: 'stables' },
    artillery: { name: 'Artillery', abbr: 'A', cls: 'land', role: 'combat', hp: 5, move: 2, range: 2, ammo: 3, idle: { food: 1 }, perTile: { fuel: 1 }, repair: 'mech', cost: { mp: 4, clothing: 2, metal: 4, tools: 2, machinery: 2, rubber: 2 }, builtAt: ['machineryWorkshop', 'machineryFactory'], unlock: 'machineryWorkshop' },
    tank: { name: 'Tank', abbr: 'T', cls: 'land', role: 'combat', hp: 15, move: 4, range: 1, ammo: 2, idle: { food: 1 }, perTile: { fuel: 2 }, repair: 'mech', capture: true, cost: { mp: 6, clothing: 3, metal: 10, tools: 4, machinery: 4, rubber: 4 }, builtAt: ['machineryFactory'], unlock: 'machineryFactory' },
    caravan: { name: 'Caravan', abbr: 'Ca', cls: 'land', role: 'logistic', hp: 1, move: 3, idle: { food: 1 }, perTile: { food: 1 }, repair: 'bio', cargo: 20, carry: 0, cost: { mp: 2, clothing: 1, horses: 4, lumber: 4 }, builtAt: ['stables'], unlock: 'stables' },
    supplyTruck: { name: 'Supply truck', abbr: 'ST', cls: 'land', role: 'logistic', hp: 5, move: 4, idle: { food: 1 }, perTile: { fuel: 0.5 }, repair: 'mech', cargo: 40, carry: 2, carryTypes: { infantry: 1, artillery: 2 }, cost: { mp: 2, clothing: 1, metal: 6, tools: 2, machinery: 1, rubber: 2 }, builtAt: ['machineryWorkshop', 'machineryFactory'], unlock: 'machineryWorkshop' },
    train: { name: 'Train', abbr: 'Tr', cls: 'rail', role: 'logistic', hp: 10, move: 6, idle: { fuel: 1 }, perTile: { fuel: 1 }, repair: 'mech', cargo: 120, carry: 4, cost: { mp: 4, clothing: 2, lumber: 4, metal: 12, tools: 4, machinery: 3 }, builtAt: ['machineryWorkshop', 'machineryFactory'], unlock: 'machineryWorkshop' },
    merchantman: { name: 'Merchantman', abbr: 'Me', cls: 'ship', power: 'sail', role: 'logistic', hp: 10, move: 3, idle: { food: 1 }, perTile: { food: 0.5 }, repair: 'sail', cargo: 100, carry: 3, cost: { mp: 4, clothing: 2, cloth: 6, lumber: 16, metal: 2, tools: 2 }, builtAt: ['shipyard'], unlock: 'shipyard' },
    frigate: { name: 'Frigate', abbr: 'Fg', cls: 'ship', power: 'sail', role: 'combat', hp: 25, move: 4, range: 2, ammo: 2, idle: { food: 2 }, perTile: { food: 1 }, repair: 'sail', cost: { mp: 6, clothing: 3, cloth: 8, smallArms: 4, lumber: 20, metal: 4, tools: 4 }, builtAt: ['shipyard'], unlock: 'shipyard' },
    freighter: { name: 'Freighter', abbr: 'Fr', cls: 'ship', power: 'steam', role: 'logistic', hp: 15, move: 5, idle: { food: 1, fuel: 1 }, perTile: { fuel: 1 }, repair: 'mech', cargo: 200, carry: 6, cost: { mp: 6, clothing: 3, lumber: 12, metal: 8, tools: 4, machinery: 2 }, builtAt: ['navalYard'], unlock: 'navalYard' },
    warship: { name: 'Warship', abbr: 'W', cls: 'ship', power: 'steam', role: 'combat', hp: 50, move: 5, range: 2, ammo: 4, idle: { food: 2, fuel: 2 }, perTile: { fuel: 1 }, repair: 'mech', cost: { mp: 10, clothing: 5, lumber: 10, metal: 20, tools: 6, machinery: 5 }, builtAt: ['navalYard'], unlock: 'navalYard' },
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
    // Rubber and oil are concentrated: most tiles sit in one region of the map
    // (placed away from the starting cities), the rest are scattered.
    rubber: { perPlayerMin: 2, perPlayerMax: 3, regionShare: 0.7 },
    oil: { perPlayerMin: 3, perPlayerMax: 4, regionShare: 0.7 },
  };

  const STACK = { logistics: 2 }; // per tile, besides one combat unit (city tiles are exempt)
  const DEMOLISH = { mp: 2, refund: 0.5 };
  const PEACE = { minTerm: 3, maxTerm: 15 };

  const START = { stock: { lumber: 65, food: 50, ore: 30, metal: 30, tools: 30 }, credits: 1500, manpower: 30 };

  // Clearing a forest tile inside a city's territory: it becomes grassland.
  const CLEAR_FOREST = { tools: 1, mp: 2, lumber: 30 };

  const DEFAULT_PRIORITY = [
    'farm', 'fishery', 'residence', 'lumberYard', 'oreMine', 'coalMine', 'charcoalRefinery', 'oilField', 'fiberFarm', 'rubberPlantation', 'stables',
    'metalForge', 'metalFactory', 'workshop', 'toolsFactory', 'smallArmsFactory', 'ammoFactory',
    'textileWorkshop', 'clothFactory', 'clothingFactory', 'machineryWorkshop', 'machineryFactory', 'university', 'taxOffice',
  ];

  const PLAYER_COLORS = ['#d7263d', '#1b998b', '#3a6ea5', '#f49d37', '#7b2cbf', '#e0c341', '#ff6f91', '#2e4057', '#8cb369', '#a0522d'];

  const ERA_NAMES = { 1: 'Foundations', 2: 'Steel and Steam', 3: 'Industry' };

  return {
    GOODS, GOOD_NAMES, GOOD_COLORS, BASE_PRICE, MARKET, SPECIAL_STORAGE, TILES, BUILDINGS, UNITS, DAMAGE, WEAPON_AMMO, WEAPON_RANGE,
    dmg, CITY, REPAIR, MAP, STACK, DEMOLISH, PEACE, START, CLEAR_FOREST, DEFAULT_PRIORITY, PLAYER_COLORS, ERA_NAMES,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RULES;
