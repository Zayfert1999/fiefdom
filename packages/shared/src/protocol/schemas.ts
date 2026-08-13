// packages/shared/src/protocol/schemas.ts
// 🌟 Zod-схемы для runtime-валидации входящих данных
// Сервер использует их для проверки клиентских запросов

import { z } from 'zod';

// ============================================
// 🏠 Лобби
// ============================================

export const CreateRoomSchema = z.object({
  playerName: z.string().min(1).max(20),
  settings: z.object({
    isPrivate: z.boolean(),
    turnTimerSeconds: z.number().min(0).max(300),
    maxPlayers: z.number().min(2).max(5),
  }),
  preferredColor: z.string().optional(),
});

export const JoinRoomSchema = z.object({
  roomId: z.string().length(6),
  playerName: z.string().min(1).max(20),
  preferredColor: z.string().optional(),
});

export const SetReadySchema = z.boolean();

// ============================================
// 🎮 Игра
// ============================================

export const PlaceTileSchema = z.object({
  x: z.number().int().min(-25).max(25),
  y: z.number().int().min(-25).max(25),
  rotation: z.union([
    z.literal(0),
    z.literal(90),
    z.literal(180),
    z.literal(270),
  ]),
});

export const PlaceMeepleSchema = z.object({
  featureId: z.string().min(1),
  x: z.number(),
  y: z.number(),
});

export const ReconnectSchema = z.object({
  roomId: z.string().length(6),
  playerId: z.string().min(1),
});

export const ChatMessageSchema = z.string().min(1).max(500);

// ============================================
// 🌟 Типы, выведенные из схем (для type-safety)
// ============================================

export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;
export type JoinRoomInput = z.infer<typeof JoinRoomSchema>;
export type PlaceTileInput = z.infer<typeof PlaceTileSchema>;
export type PlaceMeepleInput = z.infer<typeof PlaceMeepleSchema>;
export type ReconnectInput = z.infer<typeof ReconnectSchema>;