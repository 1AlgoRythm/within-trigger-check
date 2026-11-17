# Trigger check for Within

**Does the agent actually ask Within when a customer asks a buying question?**

[Within](https://www.getwith.in) puts a sales agent inside a vendor's MCP server. The whole product depends on one moment: the model in Claude or ChatGPT choosing to call `get_vendor_answer`. Within's console can test *what* Within answers ("Try a question"). Nothing tests *whether* the agent asks at all.

## Why this exists

![What Within does today: a buying question flows from the customer, through the vendor's MCP server and the Within SDK, to Within, and comes back as a saved answer, an offer card, a rep after consent, and a logged revenue moment](docs/diagrams/01-what-within-does.svg)

![The weak spot: the AI decides from written instructions whether to call Within, so a buying question can be missed or a normal question can raise a false alarm](docs/diagrams/02-the-weak-spot.svg)

Trigger check is that test. It runs labelled prompts through real Claude, one fresh session each, against a small vendor MCP server ("Acme") with `@getwithin/sdk` 0.3.0 installed. It scores recall (buying questions that reached Within) and precision (calls to Within that were buying questions). For every prompt, it also shows exactly what the SDK sent toward Within.

![Trigger check](docs/screenshot.png)

## What it found

**1. "Compare two companies" pulls in Within about half the time on Haiku.**
"Compare Ledgerly and Paywise" asks about two companies in the vendor's own data. Claude Haiku 5.5 called `get_vendor_answer` with topic `competitive` in **8 of 17** tries. In one of them it then offered the user "a chat with a live person", which would pull a sales rep into a data question. Claude Sonnet 5.5 did it **0 of 10** times.

The trigger list in `SERVER_INSTRUCTIONS` says "a competitive comparison". A smaller model reads that as "any comparison".

| Haiku 5.5, stub backend | Original wording | Fix v1: rename to "a comparison of this product with a competitor's" | **Fix v2: keep it, add "not a comparison of records in this product's own data"** |
|---|---|---|---|
| "Compare Ledgerly and Paywise" (should **not** call) | 7 of 15 called | 9 of 10 | **0 of 10** |
| 3 real competitor questions (should call) | 15 of 15 | 15 of 15 | **15 of 15** |
| 2 other comparisons of Acme data (should not call) | 0 of 10 | 0 of 10 | **0 of 10** |

Fix v1 *sounded* right and made things worse. That is the case for running this test on every instruction edit.

![The false alarm and the fixes: original wording 7 of 15 false alarms, fix v1 9 of 10, fix v2 0 of 10, with competitor questions at 15 of 15 throughout](docs/diagrams/06-false-alarm-and-fixes.svg)

**2. Full runs, 20 prompts each** (10 buying, 10 not, several with trap words: plan, security, billing, cancel, cost, compare, help):

| Run | Model | Fixes | Recall | Precision | Accuracy | Median time |
|---|---|---|---|---|---|---|
| 1 | Haiku 5.5 | Zod + phone | 10/10 | 10/11 | 19/20 | 5.7 s |
| 2 | Haiku 5.5 | Zod + phone | 10/10 | 10/10 | 20/20 | 5.1 s |
| 3 | Sonnet 5.5 | Zod + phone | 10/10 | 10/10 | 20/20 | 6.2 s |
| 4 | Haiku 5.5 | all three | 10/10 | 10/10 | 20/20 | 4.8 s |
| 5 | Haiku 5.5 | all three | 10/10 | 10/10 | 20/20 | 5.0 s |

![Recall and precision as a smoke alarm, with run 1 numbers: 10 caught, 0 missed, 1 false alarm, 9 correct silences](docs/diagrams/05-recall-and-precision.svg)

Recall was perfect throughout, including the implicit one: "We're adding 30 analysts next month. What changes on our Acme account?" That prompt sometimes made **two** calls (topics `seats`, then `upgrade`). Whether the console then counts one question as two revenue moments depends on Within's server, which I can't see.

## Two SDK fixes, with before and after

`npm run check-fixes` runs both checks against whatever SDK is installed.

| | Stock 0.3.0 | With `npm run fix` |
|---|---|---|
| **Docs quickstart on a fresh install** (`npm install @getwithin/sdk @modelcontextprotocol/sdk zod`, which now gets Zod 4) | crashes: `Mixed Zod versions detected in object shape.` | works |
| **Phone numbers in the model-written `context` text**, sent as `mcpIntent` on every wrapped call, even with `captureArguments` off | sent as written | `[redacted]`; "40 seats" and "2026-12" kept |

- **Zod.** The docs say Zod "is a peer dependency". `package.json` lists it under `dependencies`, so npm gives the SDK its own Zod 3 next to the project's Zod 4. The SDK then adds its `context` field with the other copy. The fix moves `zod` to `peerDependencies` (`^3.25.76 || ^4.0.0`). The SDK runs unchanged on Zod 4.

  ![The Zod bug: the SDK's private Zod 3 and the project's Zod 4 are mixed in one tool schema and the server crashes; one shared Zod fixes it](docs/diagrams/07-zod-bug.svg)

- **Phone redaction.** One pattern next to the existing email, key and card rules. It redacts 10–15 digit runs, so a long ID such as "1234 5678 9012" goes too. Names still pass through. A safer default is to send `mcpIntent` only when the vendor opts in.

  ![The PII gap: the SDK adds a context field to every tool, the model writes the user's goal there, and phone numbers reached the API unredacted until the fix](docs/diagrams/08-pii-gap.svg)

The source repo is private, so the fixes patch `node_modules/@getwithin/sdk` 0.3.0 in place (`fixes/apply.mjs`). They refuse any other version, check every edit landed, and undo with `npm run unfix`. In the real repo, each fix is a few lines.

## Run it

Needs Node 20+ and [Claude Code](https://code.claude.com) signed in (the `claude` command).

```bash
npm install
npm run fix -- --wording       # the three fixes (omit --wording to see the false alarm)
npm start                      # http://127.0.0.1:5180, then "Run 20 prompts"
```

- **Stub mode** (the default) fakes Within's API locally on `127.0.0.1:8787`, the SDK's own default. Nothing is sent to Within.
- **Real Within API:** `WITHIN_MODE=proxy SUPPORTBRIDGE_API_KEY=sb_... npm start`. Each call is forwarded to `https://app.getwith.in` and recorded on the way, so the "what left the server" view still works. Tested so far only with an invalid key, which returned `401 {"error":"unauthorized"}`, and Claude then said it couldn't load the answer and did not guess a price.
- **Repeat a prompt:** `npm run repeat -- --ids n09 --times 10 --model haiku`. Add `--extra experiments/comparison-prompts.json` for the comparison set.

## How it works

![What we built: the question list, the robot customer (claude -p), the demo vendor server with Within's SDK, the stand-in for Within, the scoreboard page, the repeat tool and the fixes](docs/diagrams/03-what-we-built.svg)

![One test run, step by step: the real trace of the run 1 false alarm, from claude -p to the verdict](docs/diagrams/04-one-test-run.svg)

The runner reads Claude's `stream-json` output for `tool_use` blocks. A prompt counts as "called Within" when `get_vendor_answer` appears.

## Architecture notes

Reading the SDK source next to the MCP spec (revision 2026-07-28) and the MCP Apps spec gives a simple rule of thumb: the model routes, the user consents, and code owns facts and state. Five places where today's design gives the model a job that belongs to the user or to code, and what is already right:

![Architecture: who should own each decision, today versus steered, for consent, the live chat, session state, telemetry and vendor instructions](docs/diagrams/09-architecture-steer.svg)

This part is judgment from reading code and specs, not a measurement. Within's server is not visible from here.

## Limits, stated plainly

- **Host.** Claude Code in headless mode with a one-line system prompt. It is not claude.ai or ChatGPT, which add their own system prompts. Treat the numbers as this harness's numbers.
- **Isolation.** The runner turns off CLAUDE.md and auto memory, but user-level Claude Code plugins still add context. For a clean run, sign in once with a separate config and set `WTC_CLAUDE_CONFIG_DIR` to it. The badge on the page says which kind of run it was. The results above are **not isolated**. Claude Code also passes the signed-in account's email to the model: one Sonnet reply signed a drafted email with it. That address is replaced with `[redacted]` in `results/`.
- **Small samples.** 20 prompts we wrote, and 5–17 repeats on the comparison cases. That is enough to find a problem, not to state a rate precisely.
- **Stub answers are canned,** so this tests routing, not answer quality.

## Files

| Path | What |
|---|---|
| `app/server.mjs`, `app/index.html` | The page and its API |
| `app/runner.mjs` | Runs one prompt through `claude -p` |
| `app/repeat.mjs` | Repeats chosen prompts N times |
| `server/acme-mcp.mjs` | The demo vendor server, from Within's quickstart |
| `server/within-relay.mjs` | Stub or proxy for Within's API |
| `fixes/apply.mjs`, `fixes/check.mjs` | The fixes and their before/after check |
| `prompts.json`, `experiments/comparison-prompts.json` | The labelled prompts |
| `docs/diagrams/` | The nine diagrams in this README (animated SVG) |

Built with Claude Code by Satyaa Sudarshan Guruswamy Sethuraman. Not affiliated with Within.
