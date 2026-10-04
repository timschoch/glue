// The length of the day in an ISO time: 2026-10-02.
const DAY_LENGTH = 10

export function todayUtc(): string {
  return new Date().toISOString().slice(0, DAY_LENGTH)
}
