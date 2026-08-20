export function nextTelegramUpdateOffset(currentOffset, updateId) {
  const current = Number.isInteger(Number(currentOffset)) ? Number(currentOffset) : 0;
  const next = Number.isInteger(Number(updateId)) ? Number(updateId) + 1 : current;
  return Math.max(current, next);
}

export function persistedTelegramUpdateOffset(payload) {
  const value = Number(payload?.updateOffset);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

export function isExpiredTelegramCallbackError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("query is too old") || message.includes("query ID is invalid");
}
