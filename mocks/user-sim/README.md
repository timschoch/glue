# user-sim

A Mock of real users (see [CONTEXT.md](../../CONTEXT.md)). Browser bots use a deployed Product like people do. What each screen shows changes what they do, so a product change moves the numbers. Decision D17.

The bots send nothing to analytics. The product's own posthog-js sends the events to [mock-analytics](../analytics/README.md), and Glue's `measure` reads them.

Must not import from Glue's `src/`, and `src/` must not import from it.

## Run

```sh
pnpm exec playwright install chromium   # once
pnpm --filter user-sim simulate --target <url> --journey flexibeck --users <n> --seed <s> [--concurrency <c>]
```

Prints per step how many bots reached it, did not find it (`not found`) or had an action fail on it (`error`), and how many finished. The same seed gives the same bots and the same choices.

A bot leaves like a closed tab: it opens `about:blank`, so the product's posthog-js sends its queue on `pagehide`. It then waits up to 5 seconds for those requests before it closes the browser context.

## Bots

Each bot draws its traits from the seed:

| Trait       | Values                                                        |
| ----------- | ------------------------------------------------------------- |
| patience    | 0 to 1                                                        |
| experience  | with sourdough, 0 novice to 1 expert                          |
| device      | desktop 1280 wide or mobile 390 wide                          |
| time of day | local hour 0 to 23, sent to the product as the browser's zone |

## Journeys

One file per Product in [src/journeys/](src/journeys/). A journey is a list of steps. Each step is an intent ("import a recipe") with the actions for it, found by accessible role and name: `fill`, `click`, `choose`. `choose` picks one choice in each choice group on the screen. A step whose targets are not on the screen within 10 seconds counts as not found, and the bot leaves.

## Rules

On each step the bot reads the screen through the accessibility tree ([src/screen.ts](src/screen.ts)): the choice groups with their count of choices and preselected choice, required inputs, visible text length. It never reads product source or event names.

A choice group is one of these, and each is a decision of its own:

- the radios of one `radiogroup`
- the radios of one `group` (a fieldset) that holds no inner group
- the options of one `listbox`
- the toggle buttons (`aria-pressed`) of one `group` or `toolbar`

Plain buttons such as Continue or Cancel are never choices.

| Rule                                            | Effect                                                                                          | Sources                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [Choice overload](src/rules/choice-overload.ts) | More choices, higher chance to leave. Less for experienced and patient bots.                    | Iyengar and Lepper 2000; Scheibehenne et al. 2010; Chernev et al. 2015; Chernev 2003; Hick 1952                |
| [Default effect](src/rules/default-effect.ts)   | A preselected choice is kept more often. Less for experienced bots.                             | Johnson and Goldstein 2003; McKenzie, Liersch and Finkelstein 2006                                             |
| [Effort and text load](src/rules/effort.ts)     | Long text and required inputs raise the chance to leave. Less for patient bots, more on mobile. | Nielsen 2008, How little do users read?; Baymard Institute; Nielsen 2011, Mobile content is twice as difficult |

The sources measure buying, decision time, reading and understanding. None of them measures leaving a screen. The leave chances and their sizes are this model's own assumptions, stated in each rule file. The two meta-analyses (Scheibehenne et al. 2010, Chernev et al. 2015) find choice overload small on average and strong only for complex sets, hard tasks and unclear preferences.

The leave chances combine as independent reasons, one per choice group plus effort: `1 - (1 - overload₁)(1 - overload₂)…(1 - effort)`.

Neither the product team nor Glue tunes the rules to get a result. A change to a rule needs its own Decision.

## Tests

- Rules and bots: `pnpm exec vitest run mocks/user-sim`
- End to end, against fixture pages served in the tests: `pnpm exec playwright test`. The fast specs carry `@smoke` and run in `verify ci`. The run of 3 against 12 choices runs in `verify nightly`.
