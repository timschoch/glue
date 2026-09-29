# Design

The locked design system for Glue. Every screen uses these tokens.

- Tokens as TypeScript and the Mantine theme: [src/theme.ts](src/theme.ts)
- Tokens as CSS variables: [src/styles.css](src/styles.css)
- The reference component: [decision-card.tsx](src/components/decisions/decision-card.tsx)
- [src/theme.test.ts](src/theme.test.ts) fails when this file, the theme and the stylesheet differ.

## Direction

- Glue is a reading tool. People and agents read a record, then follow its links to the Goal and the evidence.
- Dense, calm, text first. Typography carries the page. No illustrations, no gradients, no shadows.
- Paper and ink: warm neutral surfaces, near-black text, one blue-black accent.
- The accent marks what you can follow: links, record ids, the focus ring. Keep it below 5% of the screen.
- Red is for an error only: the text of the error and the border of its field.
- Light scheme only.

## Tokens

Change a value here, in [src/theme.ts](src/theme.ts) and in [src/styles.css](src/styles.css) together.

```css
:root {
  /* Ramps: 0 is the lightest step, 9 the darkest */
  --ramp-neutral-0: oklch(99.2% 0.004 85);
  --ramp-neutral-1: oklch(97.6% 0.006 85);
  --ramp-neutral-2: oklch(95.2% 0.008 85);
  --ramp-neutral-3: oklch(89% 0.01 85);
  --ramp-neutral-4: oklch(80% 0.012 85);
  --ramp-neutral-5: oklch(62% 0.014 85);
  --ramp-neutral-6: oklch(47% 0.014 85);
  --ramp-neutral-7: oklch(36% 0.014 85);
  --ramp-neutral-8: oklch(28% 0.012 85);
  --ramp-neutral-9: oklch(21% 0.012 85);
  --ramp-accent-0: oklch(97% 0.012 262);
  --ramp-accent-1: oklch(93.5% 0.028 262);
  --ramp-accent-2: oklch(88% 0.052 262);
  --ramp-accent-3: oklch(80% 0.085 262);
  --ramp-accent-4: oklch(70% 0.12 262);
  --ramp-accent-5: oklch(60% 0.15 262);
  --ramp-accent-6: oklch(52% 0.17 262);
  --ramp-accent-7: oklch(44% 0.16 262);
  --ramp-accent-8: oklch(37% 0.14 262);
  --ramp-accent-9: oklch(29% 0.11 262);
  --ramp-danger-0: oklch(97% 0.012 25);
  --ramp-danger-1: oklch(93.5% 0.028 25);
  --ramp-danger-2: oklch(88% 0.052 25);
  --ramp-danger-3: oklch(80% 0.085 25);
  --ramp-danger-4: oklch(70% 0.12 25);
  --ramp-danger-5: oklch(60% 0.15 25);
  --ramp-danger-6: oklch(52% 0.17 25);
  --ramp-danger-7: oklch(44% 0.16 25);
  --ramp-danger-8: oklch(37% 0.14 25);
  --ramp-danger-9: oklch(29% 0.11 25);

  /* Colour roles: components use these, not the ramps */
  --color-paper: var(--ramp-neutral-1);
  --color-paper-raised: var(--ramp-neutral-0);
  --color-paper-sunken: var(--ramp-neutral-2);
  --color-rule: var(--ramp-neutral-3);
  --color-rule-strong: var(--ramp-neutral-5);
  --color-muted: var(--ramp-neutral-6);
  --color-ink-soft: var(--ramp-neutral-7);
  --color-ink: var(--ramp-neutral-9);
  --color-accent: var(--ramp-accent-7);
  --color-accent-strong: var(--ramp-accent-8);
  --color-accent-wash: var(--ramp-accent-1);
  --color-accent-ink: var(--ramp-neutral-0);
  --color-focus: var(--ramp-accent-7);
  --color-danger: var(--ramp-danger-7);

  /* Type */
  --font-display:
    'Newsreader Variable', 'Iowan Old Style', 'Palatino Linotype', serif;
  --font-body: 'IBM Plex Sans Variable', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-md: 1rem;
  --text-lg: 1.25rem;
  --text-xl: 1.5625rem;
  --leading-title: 1.25;
  --leading-ui: 1.4;
  --leading-prose: 1.55;

  /* Space, 4 pt grid */
  --space-3xs: 0.125rem;
  --space-2xs: 0.25rem;
  --space-xs: 0.5rem;
  --space-sm: 0.75rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2.5rem;
  --space-2xl: 4rem;

  /* Shape and measure */
  --radius-control: 0.25rem;
  --radius-card: 0.375rem;
  --measure-prose: 68ch;

  /* Motion */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --duration-micro: 120ms;
  --duration-short: 220ms;
}
```

## Type

Three families, all free (SIL Open Font License), self-hosted through Fontsource. Do not add a fourth.

| Token            | Family        | Use                                                 |
| ---------------- | ------------- | --------------------------------------------------- |
| `--font-display` | Newsreader    | Page headings and record titles. Weight 600, roman. |
| `--font-body`    | IBM Plex Sans | All other text. Weight 400, labels 500.             |
| `--font-mono`    | IBM Plex Mono | Record ids, such as `D5`, and code. Weight 500.     |

- Five sizes. `--text-md` is the body size. Record titles use `--text-lg`, the page heading uses `--text-xl`.
- `--text-sm` for metadata and labels. `--text-xs` only for a short note, never for a sentence that people must read.
- Headings, labels, metadata and lists: `--leading-ui`. Paragraphs: `--leading-prose`.
- `--leading-title` is only for large text that stays on one line, such as the name of the app. A record title wraps, so it is not such text.
- Headings are never italic. Italic is for emphasis in a paragraph.
- A long title wraps: `overflow-wrap: anywhere`, `min-width: 0` and `text-wrap: balance`. Do not truncate a title, the title is the content.
- Paragraphs are `--measure-prose` wide at most.
- Numbers in a column: `font-variant-numeric: tabular-nums`.
- Dates are ISO, `2026-09-29`, in a `<time>` element.

## Colour

| Role                    | Use                                                           |
| ----------------------- | ------------------------------------------------------------- |
| `--color-paper`         | Page background                                               |
| `--color-paper-raised`  | Card surface                                                  |
| `--color-paper-sunken`  | Inset area, such as a code block                              |
| `--color-rule`          | Borders and dividers that group content                       |
| `--color-rule-strong`   | Border of a control, such as an input. Contrast 3:1 on paper. |
| `--color-ink`           | Titles and body text                                          |
| `--color-ink-soft`      | Secondary text                                                |
| `--color-muted`         | Metadata and labels                                           |
| `--color-accent`        | Links, record ids, the primary button                         |
| `--color-accent-strong` | Hover and pressed state of the accent                         |
| `--color-accent-wash`   | Text selection, selected row                                  |
| `--color-accent-ink`    | Text on an accent background                                  |
| `--color-focus`         | Focus ring, the same step as the Mantine focus ring           |
| `--color-danger`        | Text of an error, border of a field with an error             |

- Every text role has a contrast of 4.5:1 or more on `--color-paper` and `--color-paper-raised`.
- Components use the roles. A colour or font value outside the token block is an error: add a token first.
- No pure black, no pure white.
- Status never depends on colour alone. Pair it with a word and a shape.

## Spacing

- Every margin, padding and gap is a `--space-*` step.
- Inside a group: `--space-2xs` to `--space-sm`. Between groups in a card: `--space-md`. Card padding: `--space-md`, from 48 rem viewport width `--space-lg`. Between page sections: `--space-xl`.
- Related items are closer together than unrelated items. Do not give all gaps the same size.

## Density

- Many records on one screen is the normal state. A list of cards has a gap of `--space-sm`.
- A card is a bordered surface: `--color-paper-raised`, 1 px `--color-rule`, `--radius-card`. No shadow, no card inside a card, no coloured stripe on one side.
- Write for narrow screens first. Add columns with `min-width` queries in `rem`. The page has no horizontal scroll from 320 px viewport width.
- A label and value pair is a `<dl>`. The label is above the value on a narrow screen and to the left of it from 36 rem.

## Component voice

- Record reference: the id in `--font-mono` and `--color-accent`, then the title in `--color-ink`, both in one link. The id does not wrap. The underline shows on hover.
- Status: a small square plus the word. Accepted is a filled square, proposed and draft are an outline, superseded is an outline with the word struck through.
- Labels are sentence case and have no colon: `Goal`, `Evidence`. No uppercase labels with wide letter spacing.
- Each value has its label, also in a line of metadata: `Status`, `Date`, `Owner`.
- A list without records says so in one sentence, such as `No evidence yet`. Do not hide the label.
- A link looks like a link, a button looks like a button. One primary button per screen at most.
- Controls have `--radius-control`.
- Text is plain and states facts. No marketing words, no exclamation marks, no made-up numbers.

## Navigation

- The page frame is one bar: the name of the app links to the overview, then the account and the sign-out button. It does not stick to the viewport.
- The first link of a page skips to the content. It shows when it has the focus.
- The overview links to its sections, each with the number of its records.
- A record page starts with a breadcrumb: the overview, then the section of the record.
- A link in text has `--color-accent` and an underline. A record reference has the underline on hover only, its id shows that it is a link.
- The hover look is inside `@media (hover: hover)`. The pressed look is outside of it.
- A link or button is 24 px high or more.

## Forms

- One column. The label is above its field. A hint is between the label and the field.
- The text in a field is `--text-md`, so a phone does not zoom in.
- The checks run on submit. Each bad field gets its error below it and the first bad field gets the focus. An error says how to fix the field.
- An error of the whole form is above the fields, in `--color-danger`.
- The button stays active until the request starts. During the request it is disabled and says what it does: `Signing in`.

## States

- Loading: one line of `--color-muted` text. No spinner, no skeleton.
- Error: what did not load, how to go on, and a button that loads again.
- Empty: what belongs in the place, in one or two sentences.

## Motion

- Only colour and opacity change, in `--duration-micro` with `--ease-out`. Nothing moves when the page loads.
- Never `transition: all`. Animate `transform` and `opacity` only when a layout must move.
- The focus ring shows immediately: 2 px `--color-focus`, offset 2 px, on `:focus-visible`.
- With `prefers-reduced-motion: reduce` all transitions are off.

## Mantine

[src/theme.ts](src/theme.ts) maps the tokens to the Mantine theme, so Mantine components follow the system without extra styles.

| Mantine                                                    | Token                                          |
| ---------------------------------------------------------- | ---------------------------------------------- |
| `primaryColor` `accent`, `primaryShade` 7                  | `--ramp-accent-*`                              |
| `colors.gray`, `white`, `black`                            | `--ramp-neutral-*`, step 0, step 9             |
| `fontFamily`, `fontFamilyMonospace`, `headings.fontFamily` | `--font-body`, `--font-mono`, `--font-display` |
| `fontSizes`                                                | `--text-*`                                     |
| `spacing`                                                  | `--space-*`                                    |
| `radius.sm`, `radius.md`                                   | `--radius-control`, `--radius-card`            |
| `--mantine-color-body`                                     | `--color-paper`                                |
| `colors.red`, `--mantine-color-error`                      | `--ramp-danger-*`, `--color-danger`            |

- In a CSS Module use the tokens from this file, not the `--mantine-*` variables.
- In a Mantine prop use the theme key: `c="dimmed"`, `fz="sm"`, `gap="xs"`.
- Buttons: `filled` for the one primary action, `default` for the others.
- Do not use `autoContrast`, `darken` or `lighten` on a theme colour: they cannot read `oklch()`.

## Open

These parts have no design. Design them and add them here before you use them.

- Dark scheme
- Colours for warning and success
- Tables outside the text of a record
- Fields other than text, email and password
