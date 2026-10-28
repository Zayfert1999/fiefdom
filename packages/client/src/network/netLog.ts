// packages/client/src/network/netLog.ts
// 🌟 Отладочный лог сетевого слоя: печатается только в dev-сборке.
// В продакшене подробные логи (на каждый state-update) не нужны и только
// засоряют консоль пользователя. warn/error по-прежнему идут через console.

export const netLog: (...args: unknown[]) => void = import.meta.env.DEV
  ? (...args) => console.log(...args)
  : () => { };
