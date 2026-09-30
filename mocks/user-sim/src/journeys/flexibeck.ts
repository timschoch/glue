import type { Journey } from '../journey.ts'

// The live screens of https://flexibeck.vercel.app, found by accessible names
// (Decision D23). When a step is not found, the bot leaves and the summary counts
// it under "not found".
export const flexibeck: Journey = {
  product: 'flexibeck',
  steps: [
    {
      intent: 'start planning',
      actions: [{ kind: 'click', role: 'link', name: /start planning/i }],
    },
    {
      intent: 'sign up',
      actions: [{ kind: 'click', role: 'link', name: /create an account/i }],
    },
    {
      intent: 'enter account details',
      actions: [
        { kind: 'fill', label: 'Name', value: 'User Sim' },
        { kind: 'fill', label: /email/i, value: '{email}' },
        { kind: 'fill', label: /password/i, value: '{password}' },
        { kind: 'answer', question: /experience/i, from: 'experience' },
        { kind: 'click', role: 'button', name: /create account/i },
      ],
    },
    {
      intent: 'pick a recipe',
      // Recipe buttons are plain buttons, not choices: the bot takes the first.
      actions: [{ kind: 'click', role: 'button', name: /brot/i }],
    },
    {
      intent: 'set availability',
      // The week plan comes filled in. The bot keeps it.
      actions: [{ kind: 'click', role: 'button', name: /save availability/i }],
    },
    {
      intent: 'set the start time',
      actions: [
        { kind: 'choose' },
        { kind: 'click', role: 'button', name: /show plans/i },
      ],
    },
    {
      intent: 'accept a plan',
      actions: [{ kind: 'click', role: 'button', name: /accept this plan/i }],
    },
    {
      intent: 'do the first reminder',
      actions: [{ kind: 'click', role: 'button', name: 'Done' }],
    },
    {
      intent: 'answer the survey',
      actions: [
        { kind: 'answer', question: /how easy/i, from: 'seq' },
        { kind: 'fill', label: /what was hard/i, value: '{comment}' },
        { kind: 'click', role: 'button', name: /send answer/i },
      ],
    },
  ],
}
