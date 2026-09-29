// The first letter of a record id names the kind of the record:
// Goal, Decision, Insight, Fact, Guardrail (R, for rule).
export function isRecordId(value: string): boolean {
  return /^[GDIFR]\d+$/.test(value)
}
