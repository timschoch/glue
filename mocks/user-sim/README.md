# user-sim

A Mock of real users (see [CONTEXT.md](../../CONTEXT.md)). Browser bots use a deployed Product like people do. What each screen shows changes what they do, so a product change moves the numbers. Decision D17.

The bots send nothing to analytics. The product's own posthog-js sends the events to [mock-analytics](../analytics/README.md), and Glue's `measure` reads them.

Must not import from Glue's `src/`, and `src/` must not import from it.

## Run

```sh
pnpm exec playwright install chromium   # once
pnpm --filter user-sim simulate --target <url> --journey flexibeck --users <n> --seed <s> [--concurrency <c>]
```

Prints per step how many bots reached it, did not find it (`not found`) or got an error on it (`error`), how many finished, and the survey answers. The same seed gives the same bots and the same choices. An error is a failed action, or a rate limit: HTTP 429 from the product, or the text "Too many requests" on the screen.

A live target is any host other than `localhost` or `127.0.0.1`. On a live target a run has at most 50 users and 2 at the same time, and a new bot starts 2 seconds after the one before it ([src/traffic.ts](src/traffic.ts)). The run prints each cap it applies, for example `user-sim: capped concurrency 4 → 2 on a live target`.

Every request to the target's origin carries the header `x-glue-bot: 1`, so the product can tell bots from people. Requests to other origins, for example analytics, do not carry it: a custom header makes the browser send a CORS preflight, which a host that does not allow the header fails.

A bot leaves like a closed tab: it opens `about:blank`, so the product's posthog-js sends its queue on `pagehide`. It then waits until those requests are done and no new request came for 0.5 seconds, for 5 seconds at most, before it closes the browser context.

## Bots

Each bot draws its traits from the seed:

| Trait       | Values                                                        |
| ----------- | ------------------------------------------------------------- |
| patience    | 0 to 1                                                        |
| experience  | with sourdough, 0 novice to 1 expert                          |
| device      | desktop 1280 wide or mobile 390 wide                          |
| time of day | local hour 0 to 23, sent to the product as the browser's zone |

## Journeys

One file per Product in [src/journeys/](src/journeys/). A journey is a list of steps. Each step is an intent ("accept a plan") with the actions for it, found by accessible role and name: `fill`, `click`, `choose`, `answer`. `choose` picks one choice in each choice group on the screen. `answer` answers one named radio group for the bot itself: its own experience, or its SEQ score. That radio group is not a choice, so it adds no choice overload. In a `fill` value, `{email}` and `{password}` become the bot's own, and `{remark}` its Remark. A step whose targets are not on the screen within 10 seconds counts as not found, and the bot leaves.

A step with `optional: true` is for a screen that comes only sometimes. The bot does it when the screen shows it, else it goes on with the next step at once. The summary counts it as reached only for the bots that did it.

The flexibeck journey follows the live screens of https://flexibeck.vercel.app: start planning, sign up, pick a recipe, set availability, set the start time, take the closest plan (optional), accept a plan, do the first reminder, answer the survey. When no plan fits the availability, flexibeck first shows the closest plan with the button "Plan bread ready by …". The bot takes it, like a novice would, and then accepts a plan from the list.

## Rules

On each step the bot reads the screen through the accessibility tree ([src/screen.ts](src/screen.ts)): the choice groups with their count of choices and preselected choice, required inputs, visible text length, and the techniques the text names that have no demo. A demo is a captioned image or video (an accessible `figure`) whose name names the technique, for example a video in a figure with a `figcaption`. A bare `video` has no role in the accessibility tree, so it does not count. The bot never reads product source or event names.

A choice group is one of these, and each is a decision of its own:

- the radios of one `radiogroup`
- the radios of one `group` (a fieldset) that holds no inner group
- the options of one `listbox`
- the toggle buttons (`aria-pressed`) of one `group` or `toolbar`

Plain buttons such as Continue or Cancel are never choices.

| Rule                                            | Effect                                                                                                                                                | Sources                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [Choice overload](src/rules/choice-overload.ts) | More choices, higher chance to leave. Less for experienced and patient bots.                                                                          | Iyengar and Lepper 2000; Scheibehenne et al. 2010; Chernev et al. 2015; Chernev 2003; Hick 1952                |
| [Default effect](src/rules/default-effect.ts)   | A preselected choice is kept more often. Less for experienced bots.                                                                                   | Johnson and Goldstein 2003; McKenzie, Liersch and Finkelstein 2006                                             |
| [Effort and text load](src/rules/effort.ts)     | Long text and required inputs raise the chance to leave. Less for patient bots, more on mobile.                                                       | Nielsen 2008, How little do users read?; Baymard Institute; Nielsen 2011, Mobile content is twice as difficult |
| [Worked example](src/rules/worked-example.ts)   | A technique (stretch and fold, lamination, shaping) the screen names without a demo raises the chance to leave. Strong for novices, none for experts. | Sweller and Cooper 1985; Renkl 2014                                                                            |

The sources measure buying, decision time, reading and understanding. None of them measures leaving a screen. The leave chances and their sizes are this model's own assumptions, stated in each rule file. The two meta-analyses (Scheibehenne et al. 2010, Chernev et al. 2015) find choice overload small on average and strong only for complex sets, hard tasks and unclear preferences.

The leave chances combine as independent reasons, one per choice group plus effort plus worked example: `1 - (1 - overload₁)(1 - overload₂)…(1 - effort)(1 - workedExample)`. That is the bot's struggle on the screen ([src/struggle.ts](src/struggle.ts)). Over its walk the bot adds up its struggle per Rule the same way.

Neither the product team nor Glue tunes the rules to get a result. A change to a rule needs its own Decision.

## Survey

A bot that reaches a survey answers the Single Ease Question (SEQ, 1 very hard to 7 very easy; Sauro and Dumas 2009) from the struggle of its whole walk: no struggle scores 7, more struggle scores lower, with up to half a point of noise ([src/survey.ts](src/survey.ts)). With a chance as high as its struggle, it writes a Remark from a short scripted list for the Rule it struggled with most, for example `A video of each step would help`. Scripted Remarks are allowed for the role play (Insight I21, Decision D23). flexibeck sends the Remark in the event property `comment`. The summary adds the count of answers, the SEQ mean and the count of Remarks.

## Tests

- Rules and bots: `pnpm exec vitest run mocks/user-sim`
- End to end, against fixture pages served in the tests: `pnpm exec playwright test`. The fast specs carry `@smoke` and run in `verify ci`. The run of 3 against 12 choices runs in `verify nightly`.
