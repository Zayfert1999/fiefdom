import type { Tile } from '@/core/types';

export const TILE_DEFINITIONS: Tile[] = [
  //{ id: 'tile_CCCC -S', sides: ['city', 'city', 'city', 'city'], features: ['shield'], quantity: 1 },
  //{ id: 'tile_CCFC -S', sides: ['city', 'city', 'field', 'city'], features: ['shield'], quantity: 1 },
  //{ id: 'tile_CCFC', sides: ['city', 'city', 'field', 'city'], features: [], quantity: 3 },
  //{ id: 'tile_CCFF -S', sides: ['city', 'city', 'field', 'field'], features: ['shield'], quantity: 2 },
  //{ id: 'tile_CCFF', sides: ['city', 'city', 'field', 'field'], features: [], quantity: 3 },
  //{ id: 'tile_CCRC -S', sides: ['city', 'city', 'road', 'city'], features: ['shield'], quantity: 2 },
  //{ id: 'tile_CCRC', sides: ['city', 'city', 'road', 'city'], features: [], quantity: 1 },
  //{ id: 'tile_CFCF', sides: ['city', 'field', 'city', 'field'], features: [], quantity: 3 },
  //{ id: 'tile_CFFC', sides: ['city', 'field', 'field', 'city'], features: [], quantity: 2 },
  //{ id: 'tile_CFFF', sides: ['city', 'field', 'field', 'field'], features: [], quantity: 5 },
  //{ id: 'tile_CFRR', sides: ['city', 'field', 'road', 'road'], features: [], quantity: 3 },
  //{ id: 'tile_CRFR', sides: ['city', 'road', 'field', 'road'], features: [], quantity: 4 },
  //{ id: 'tile_CRRC -S', sides: ['city', 'road', 'road', 'city'], features: ['shield'], quantity: 2 },
  //{ id: 'tile_CRRC', sides: ['city', 'road', 'road', 'city'], features: [], quantity: 3 },
  //{ id: 'tile_CRRF', sides: ['city', 'road', 'road', 'field'], features: [], quantity: 3 },
  //{ id: 'tile_CRRR', sides: ['city', 'road', 'road', 'road'], features: ['village'], quantity: 3 },
  //{ id: 'tile_FCFC -S', sides: ['field', 'city', 'field', 'city'], features: ['shield'], quantity: 2 },
  //{ id: 'tile_FCFC', sides: ['field', 'city', 'field', 'city'], features: [], quantity: 1 },
  //{ id: 'tile_FFFF -M', sides: ['field', 'field', 'field', 'field'], features: ['monastery'], quantity: 4 },
  //{ id: 'tile_FFRF -M', sides: ['field', 'field', 'road', 'field'], features: ['monastery'], quantity: 2 },
  { id: 'tile_FRRF', quantity: 9, features: [
      {id: 'road_se', type: 'road', directions: ['S', 'C', 'E'], spots: [{ x: 55, y: 55 }]},
      {id: 'field_nw', type: 'field', directions: ['SW', 'W', 'NW', 'N', 'NE'], spots: [{ x: 25, y: 25 }]},
      {id: 'field_se', type: 'field', directions: ['SE'], spots: [{ x: 80, y: 80 }]}
    ]
  },
  { id: 'tile_FRRR', quantity: 4, features: [
      {id: 'field_n', type: 'field', directions: ['NW', 'N', 'NE'], spots: [{ x: 50, y: 20 }]},
      {id: 'road_e', type: 'road', directions: ['E', 'C'], spots: [{ x: 85, y: 50 }]},
      {id: 'field_sw', type: 'field', directions: ['SW'], spots: [{ x: 20, y: 80 }]},
      {id: 'road_s', type: 'road', directions: ['S', 'C'], spots: [{ x: 50, y: 85 }]},
      {id: 'field_se', type: 'field', directions: ['SE'], spots: [{ x: 80, y: 80 }]},
      {id: 'road_w', type: 'road', directions: ['W', 'C'], spots: [{ x: 15, y: 50 }]}
    ] 
  },
  { id: 'tile_RFRF', quantity: 8, features: [
      {id: 'road_ns', type: 'road', directions: ['N', 'C', 'S'], spots: [{ x: 50, y: 50 }]},
      {id: 'field_w', type: 'field', directions: ['NW', 'W', 'SW'], spots: [{ x: 20, y: 50 }]},
      {id: 'field_e', type: 'field', directions: ['NE', 'E', 'SE'], spots: [{ x: 80, y: 50 }]}
    ]
  },
  //{ id: 'tile_RRRR', sides: ['road', 'road', 'road', 'road'], features: ['village'], quantity: 1 },
];