import type { Tile } from './types';

export const TILE_DEFINITIONS: Tile[] = [
  { id: 'tile_CCCC -S', quantity: 1, features: [
    {id: 'city_nesw', type: 'city', shieldSpot: { x: 16, y: 16 }, directions: ['N', 'E', 'S', 'W'], spots: [{ x: 50, y: 50 }]}
    ]
  },
  { id: 'tile_CCFC -S', quantity: 1, features: [
    {id: 'city_new', type: 'city', directions: ['N', 'E', 'W'], spots: [{ x: 50, y: 50 }]},
    {id: 'field_s', type: 'field', shieldSpot: { x: 16, y: 16 }, directions: ['S'], spots: [{ x: 50, y: 90 }], adjacentCities: ['city_new']}
    ]
  },
  { id: 'tile_CCFC', quantity: 3, features: [
    {id: 'city_new', type: 'city', directions: ['N', 'E', 'W'], spots: [{ x: 50, y: 50 }]},
    {id: 'field_s', type: 'field', directions: ['S'], spots: [{ x: 50, y: 90 }], adjacentCities: ['city_new']}
    ]
  },
  { id: 'tile_CCFF -S', quantity: 2, features: [
    {id: 'city_ne', type: 'city', shieldSpot: { x: 84, y: 16 }, directions: ['N', 'E'], spots: [{ x: 75, y: 25 }]},
    {id: 'field_sw', type: 'field', directions: ['S', 'SW', 'W'], spots: [{ x: 25, y: 75 }], adjacentCities: ['city_ne']}
    ] 
  },
  { id: 'tile_CCFF', quantity: 3, features: [
    {id: 'city_ne', type: 'city', directions: ['N', 'E'], spots: [{ x: 75, y: 25 }]},
    {id: 'field_sw', type: 'field', directions: ['S', 'SW', 'W'], spots: [{ x: 25, y: 75 }], adjacentCities: ['city_ne']}
    ] 
  },
  { id: 'tile_CCRC -S', quantity: 2, features: [
    {id: 'city_new', type: 'city', shieldSpot: { x: 16, y: 16 }, directions: ['N', 'E', 'W'], spots: [{ x: 50, y: 40 }]},
    {id: 'road_s', type: 'road', directions: ['S'], spots: [{ x: 50, y: 90 }]},
    {id: 'field_se', type: 'field', directions: ['SE(S)'], spots: [{ x: 75, y: 90 }], adjacentCities: ['city_new']},
    {id: 'field_sw', type: 'field', directions: ['SW(S)'], spots: [{ x: 25, y: 90 }], adjacentCities: ['city_new']}
    ] 
  },
  { id: 'tile_CCRC', quantity: 1, features: [
    {id: 'city_new', type: 'city', directions: ['N', 'E', 'W'], spots: [{ x: 50, y: 40 }]},
    {id: 'road_s', type: 'road', directions: ['S'], spots: [{ x: 50, y: 90 }]},
    {id: 'field_se', type: 'field', directions: ['SE(S)'], spots: [{ x: 75, y: 90 }], adjacentCities: ['city_new']},
    {id: 'field_sw', type: 'field', directions: ['SW(S)'], spots: [{ x: 25, y: 90 }], adjacentCities: ['city_new']}
    ] 
  },
  { id: 'tile_CFCF', quantity: 3, features: [
    {id: 'city_n', type: 'city', directions: ['N'], spots: [{ x: 50, y: 10 }]},
    {id: 'field_ew', type: 'field', directions: ['E', 'C', 'W'], spots: [{ x: 50, y: 50 }], adjacentCities: ['city_n', 'city_s']},
    {id: 'city_s', type: 'city', directions: ['S'], spots: [{ x: 50, y: 90 }]}
    ] 
  },
  { id: 'tile_CFFC', quantity: 2, features: [
    {id: 'city_n', type: 'city', directions: ['N'], spots: [{ x: 50, y: 10 }]},
    {id: 'field_se', type: 'field', directions: ['S', 'SE', 'E'], spots: [{ x: 50, y: 50 }], adjacentCities: ['city_n', 'city_w']},
    {id: 'city_w', type: 'city', directions: ['W'], spots: [{ x: 10, y: 50 }]}
    ] 
  },
  { id: 'tile_CFFF', quantity: 5, features: [
    {id: 'city_n', type: 'city', directions: ['N'], spots: [{ x: 50, y: 10 }]},
    {id: 'field_esw', type: 'field', directions: ['E', 'SE', 'S','SW', 'W'], spots: [{ x: 50, y: 50 }], adjacentCities: ['city_n']}
    ] 
  },
  { id: 'tile_CFRR', quantity: 3, features: [ 
    {id: 'city_n', type: 'city', directions: ['N'], spots: [{ x: 50, y: 10 }]},
    {id: 'road_sw', type: 'road', directions: ['S', 'C', 'W'], spots: [{ x: 45, y: 55 }]},
    {id: 'field_e-nw', type: 'field', directions: ['NE(E)', 'E', 'SE', 'NW(W)'], spots: [{ x: 80, y: 50 }], adjacentCities: ['city_n']},
    {id: 'field_sw', type: 'field', directions: ['SW'], spots: [{ x: 20, y: 80 }]}
    ]
  },
  { id: 'tile_CRFR', quantity: 4, features: [
    {id: 'city_n', type: 'city', directions: ['N'], spots: [{ x: 50, y: 10 }]},
    {id: 'field_ne-nw', type: 'field', directions: ['NE(E)', 'NW(W)'], spots: [{ x: 90, y: 25 }], adjacentCities: ['city_n']},
    {id: 'road_ew', type: 'road', directions: ['E', 'C', 'W'], spots: [{ x: 50, y: 50 }]},
    {id: 'field_s', type: 'field', directions: ['SE', 'S', 'SW'], spots: [{ x: 50, y: 80 }]}
    ]
  },
  { id: 'tile_CRRC -S', quantity: 2, features: [
    {id: 'city_nw', type: 'city', shieldSpot: { x: 16, y: 16 }, directions: ['N', 'W'], spots: [{ x: 25, y: 25 }]},
    {id: 'field_ne-sw', type: 'field', directions: ['NE(E)', 'SW(S)'], spots: [{ x: 90, y: 30 }], adjacentCities: ['city_nw']},
    {id: 'road_se', type: 'road', directions: ['S', 'C', 'E'], spots: [{ x: 65, y: 65 }]},
    {id: 'field_se', type: 'field', directions: ['SE'], spots: [{ x: 85, y: 85 }]}
    ] 
  },
  { id: 'tile_CRRC', quantity: 3, features: [
    {id: 'city_nw', type: 'city', directions: ['N', 'W'], spots: [{ x: 25, y: 25 }]},
    {id: 'field_ne-sw', type: 'field', directions: ['NE(E)', 'SW(S)'], spots: [{ x: 90, y: 30 }], adjacentCities: ['city_nw']},
    {id: 'road_se', type: 'road', directions: ['S', 'C', 'E'], spots: [{ x: 65, y: 65 }]},
    {id: 'field_se', type: 'field', directions: ['SE'], spots: [{ x: 85, y: 85 }]}
    ] 
  },
  { id: 'tile_CRRF', quantity: 3, features: [ 
    {id: 'city_n', type: 'city', directions: ['N'], spots: [{ x: 50, y: 10 }]},
    {id: 'road_se', type: 'road', directions: ['S', 'C', 'E'], spots: [{ x: 55, y: 55 }]},
    {id: 'field_ne-w', type: 'field', directions: ['NE(E)', 'SW', 'W', 'NW(W)' ], spots: [{ x: 20, y: 50 }], adjacentCities: ['city_n']},
    {id: 'field_se', type: 'field', directions: ['SE'], spots: [{ x: 80, y: 80 }]}
    ]
  },
  { id: 'tile_CRRR', quantity: 3, features: [
    {id: 'city_n', type: 'city', directions: ['N'], spots: [{ x: 50, y: 10 }]},
    {id: 'field_ne-nw', type: 'field', directions: ['NE(E)', 'NW(W)'], spots: [{ x: 90, y: 25 }], adjacentCities: ['city_n']},
    {id: 'road_e', type: 'road', directions: ['E'], spots: [{ x: 85, y: 50 }]},
    {id: 'field_sw', type: 'field', directions: ['SW'], spots: [{ x: 20, y: 80 }]},
    {id: 'road_s', type: 'road', directions: ['S'], spots: [{ x: 50, y: 85 }]},
    {id: 'field_se', type: 'field', directions: ['SE'], spots: [{ x: 80, y: 80 }]},
    {id: 'road_w', type: 'road', directions: ['W'], spots: [{ x: 15, y: 50 }]}
    ] 
  },
  { id: 'tile_FCFC -S', quantity: 2, features: [
    {id: 'field_n', type: 'field', directions: ['N'], spots: [{ x: 50, y: 10 }], adjacentCities: ['city_ew']},
    {id: 'city_ew', type: 'city', shieldSpot: { x: 84, y: 50 }, directions: ['E', 'C', 'W'], spots: [{ x: 50, y: 50 }]},
    {id: 'field_s', type: 'field', directions: ['S'], spots: [{ x: 50, y: 90 }], adjacentCities: ['city_ew']}
    ] 
  },
  { id: 'tile_FCFC', quantity: 1, features: [
    {id: 'field_n', type: 'field', directions: ['N'], spots: [{ x: 50, y: 10 }], adjacentCities: ['city_ew']},
    {id: 'city_ew', type: 'city', directions: ['E', 'C', 'W'], spots: [{ x: 50, y: 50 }]},
    {id: 'field_s', type: 'field', directions: ['S'], spots: [{ x: 50, y: 90 }], adjacentCities: ['city_ew']}
    ] 
  },
  { id: 'tile_FFFF -M', quantity: 4, features: [
    {id: 'monastery', type: 'monastery', directions: ['C'], spots: [{ x: 50, y: 50 }]},
    {id: 'field_nesw', type: 'field', directions: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], spots: [{ x: 80, y: 20 }]},
    ]
  },
  { id: 'tile_FFRF -M', quantity: 2, features: [
    {id: 'monastery', type: 'monastery', directions: ['C'], spots: [{ x: 50, y: 50 }]},
    {id: 'field_new', type: 'field', directions: ['N', 'NE', 'E', 'SE', 'SW', 'W', 'NW'], spots: [{ x: 80, y: 20 }]},
    {id: 'road_s', type: 'road', directions: ['S'], spots: [{ x: 50, y: 80 }]},
    ]
  },
  { id: 'tile_FRRF', quantity: 9, features: [
    {id: 'road_se', type: 'road', directions: ['S', 'C', 'E'], spots: [{ x: 55, y: 55 }]},
    {id: 'field_nw', type: 'field', directions: ['SW', 'W', 'NW', 'N', 'NE'], spots: [{ x: 25, y: 25 }]},
    {id: 'field_se', type: 'field', directions: ['SE'], spots: [{ x: 80, y: 80 }]}
    ]
  },
  { id: 'tile_FRRR', quantity: 4, features: [
    {id: 'field_n', type: 'field', directions: ['NE', 'N', 'NW'], spots: [{ x: 50, y: 20 }]},
    {id: 'road_e', type: 'road', directions: ['E'], spots: [{ x: 85, y: 50 }]},
    {id: 'field_sw', type: 'field', directions: ['SW'], spots: [{ x: 20, y: 80 }]},
    {id: 'road_s', type: 'road', directions: ['S'], spots: [{ x: 50, y: 85 }]},
    {id: 'field_se', type: 'field', directions: ['SE'], spots: [{ x: 80, y: 80 }]},
    {id: 'road_w', type: 'road', directions: ['W'], spots: [{ x: 15, y: 50 }]}
    ] 
  },
  { id: 'tile_RFRF', quantity: 8, features: [
    {id: 'road_ns', type: 'road', directions: ['N', 'C', 'S'], spots: [{ x: 50, y: 50 }]},
    {id: 'field_w', type: 'field', directions: ['NW', 'W', 'SW'], spots: [{ x: 20, y: 50 }]},
    {id: 'field_e', type: 'field', directions: ['NE', 'E', 'SE'], spots: [{ x: 80, y: 50 }]}
    ]
  },
  { id: 'tile_RRRR', quantity: 1, features: [
    {id: 'road_n', type: 'road', directions: ['N'], spots: [{ x: 50, y: 15 }]},
    {id: 'field_ne', type: 'field', directions: ['NE'], spots: [{ x: 80, y: 20 }]},
    {id: 'road_e', type: 'road', directions: ['E'], spots: [{ x: 85, y: 50 }]},
    {id: 'field_sw', type: 'field', directions: ['SW'], spots: [{ x: 20, y: 80 }]},
    {id: 'road_s', type: 'road', directions: ['S'], spots: [{ x: 50, y: 85 }]},
    {id: 'field_se', type: 'field', directions: ['SE'], spots: [{ x: 80, y: 80 }]},
    {id: 'road_w', type: 'road', directions: ['W'], spots: [{ x: 15, y: 50 }]},
    {id: 'field_nw', type: 'field', directions: ['NW'], spots: [{ x: 20, y: 20 }]}
  ] 
  },
];