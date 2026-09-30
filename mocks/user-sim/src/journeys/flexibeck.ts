import type { Journey } from '../journey.ts'

// Accessible names are guesses until flexibeck's screens exist. When a step is
// not found, the bot leaves and the summary counts it under "not found".
export const flexibeck: Journey = {
  product: 'flexibeck',
  steps: [
    {
      intent: 'sign up',
      actions: [
        {
          kind: 'click',
          role: 'link',
          name: /sign up|create account|get started/i,
        },
      ],
    },
    {
      intent: 'enter account details',
      actions: [
        { kind: 'fill', label: /email/i, value: '{email}' },
        { kind: 'fill', label: /password/i, value: '{password}' },
        { kind: 'click', role: 'button', name: /sign up|create account/i },
      ],
    },
    {
      intent: 'import a recipe',
      actions: [
        {
          kind: 'fill',
          label: /recipe/i,
          value: 'https://example.com/country-sourdough',
        },
        { kind: 'click', role: 'button', name: /import/i },
      ],
    },
    {
      intent: 'set availability',
      actions: [
        { kind: 'choose' },
        { kind: 'click', role: 'button', name: /save|continue|next/i },
      ],
    },
    {
      intent: 'pick a plan mode',
      actions: [
        { kind: 'choose' },
        { kind: 'click', role: 'button', name: /continue|next|create plan/i },
      ],
    },
    {
      intent: 'accept a plan',
      actions: [{ kind: 'click', role: 'button', name: /accept/i }],
    },
  ],
}
