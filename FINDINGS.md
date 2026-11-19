# Stress test of Within's SDK: what fails, why it matters, and how to fix it

Within puts a sales agent inside a company's MCP server. A company installs one npm package, `@getwithin/sdk`, and its customers can then ask buying questions inside Claude or ChatGPT.

This report lists what we found when we tried to break that package. Every finding has a plain-words explanation first, then the technical detail an engineer needs to fix it, then a way to reproduce it in one command.

Everything ran on our own machine, against the published package (version 0.3.0) and a small stand-in for Within's server. We did not send load or attack traffic to Within's real service, and we did not look at anything behind its login.

Tested 2026-11-19 05:00 UTC on `@getwithin/sdk` 0.3.0 (file fingerprint `658d812c0ae1`), Node v26.13.0, MCP SDK 1.32.2. Line numbers below refer to that package's `dist/index.js`, because Within's source repository is not public (the address in the package's package.json returns 404).

## At a glance

**20 findings: 6 High, 10 Medium, 4 Low.** 43 automated checks ran against the published package: 8 pass, 11 fail, 14 gap (documented or undocumented behaviour worth a decision), 10 information only. A patched copy with 11 small prototype fixes turns 11 of those fails and gaps into passes.

| ID | Severity | What | Prototype fix |
|---|---|---|---|
| [W-01](#w-01) | High | The docs' own install steps crash on a new project | P10 |
| [W-02](#w-02) | High | When Within is down, the vendor's own answers can be changed, or fail | P1 |
| [W-04](#w-04) | High | A vendor tool that already has an input called `context` silently loses it | P2 |
| [W-09](#w-09) | High | Tools the vendor chose NOT to wrap still report to Within | P6 |
| [W-10](#w-10) | High | The AI's goal summary goes to Within with private details in it, and the docs table does not list it | none |
| [W-11](#w-11) | High | The customer's full question goes to Within unredacted, and the docs do not say so | none |
| [W-03](#w-03) | Medium | A hung Within adds 5 seconds to every successful wrapped tool call, every time | none |
| [W-05](#w-05) | Medium | If the AI writes a goal longer than 300 characters, the whole tool call is rejected | P3 |
| [W-08](#w-08) | Medium | With argument capture on, very long text without spaces can freeze the vendor's server for seconds | P5 |
| [W-12](#w-12) | Medium | Error messages carry private details to Within even when argument capture is off | none |
| [W-13](#w-13) | Medium | With argument capture on, tool results also leave, and several secrets slip through | none |
| [W-14](#w-14) | Medium | The docs describe a login-provider option that is not in the published package | none |
| [W-15](#w-15) | Medium | The docs say a banned phrase replaces one paragraph. The code replaces all of the vendor's instructions | P7 |
| [W-18](#w-18) | Medium | On the SDK side, consent rests on the AI, because the SDK itself does not check that the customer chose | none |
| [W-19](#w-19) | Medium | On servers that keep no sessions, a rep's offer cannot find the customer | none |
| [W-20](#w-20) | Medium | A small AI model sometimes (3 of 10) treats "compare two companies" as a sales question | P11 |
| [W-06](#w-06) | Low | When a rep's offer is attached, the vendor's own `_meta` data is removed | P4 |
| [W-07](#w-07) | Low | If the vendor's customer-identity function throws, the customer's tool call fails | P8 |
| [W-16](#w-16) | Low | A wrong key or a missing URL fails silently | P9 |
| [W-17](#w-17) | Low | Two lists of private-network addresses are defined and never used | none |

**If you only fix six things:** W-02 (an outage must not change or break the vendor's own answers), W-09, W-10 and W-11 (what leaves the vendor's server, and what the docs say about it), W-01 (the install steps must work on a new project), and W-04 (never swallow a vendor's own `context` input).

### What the severity words mean

- **High.** Can break or corrupt a vendor's own product, or sends a vendor's customer data to Within in a normal setup, in a way the docs do not say.
- **Medium.** Breaks something the docs promise, or hurts in a less common setup, or only during an outage.
- **Low.** A papercut or a hardening step. Worth fixing, unlikely to hurt anyone soon.

### What the verdicts mean

- **pass.** The package did what the docs, or a reasonable vendor, would expect.
- **FAIL.** The package contradicts its own docs, or breaks something a vendor would reasonably expect.
- **gap.** Behaviour that is documented or deliberate but leaves a risk, or behaviour the docs do not mention. A decision for Within's team, not necessarily a bug.
- **info.** A measurement, with no judgement attached.

## Breaks the vendor's own product

### W-01

**High: The docs' own install steps crash on a new project**

**In plain words.** A developer follows the docs line by line on a new project, and their server refuses to start with the error "Mixed Zod versions detected". Zod is a small library that describes what a tool's inputs must look like. The docs say the package shares the developer's copy of Zod. It actually ships its own private copy, and npm installs the developer's newer copy next to it.

**Why it matters.** It is the first thing a new vendor does. On a fresh project that follows the docs, the server does not start until the developer finds the workaround (pin an older Zod).

**What we measured.**

- `F1` (FAIL, pass on the patched copy): Is zod a peer dependency, as the docs say? @getwithin/sdk 0.3.0: dependencies.zod = ^3.25.76; peerDependencies.zod = none
- `F2` (FAIL, info on the patched copy): Does the docs' install line plus the docs' quickstart run on a fresh project? crashed: Error: Mixed Zod versions detected in object shape.

**Where in the code.**

- `package.json` lists `zod` under `dependencies` (`^3.25.76`), while the docs say "it is a peer dependency".
- `dist/index.js` line 630 builds the extra `context` input with the SDK's own copy of Zod.

**How to fix it.**

- Move `zod` to `peerDependencies` with the range `^3.25.76 || ^4.0.0`.
- Add a CI job that installs the package into an empty project and runs the docs quickstart, once with Zod 3 and once with Zod 4.

**Prototype fix.** `P10` in `stress/patches/apply.mjs`. Run `npm run test:patched` to see the checks above change.

**Note.** The repo's `npm run fix` already applies this same change.

**Reproduce.** `cd stress && npm install && node run.mjs F1 F2`

### W-02

**High: When Within is down, the vendor's own answers can be changed, or fail**

**In plain words.** The docs promise that if Within cannot be reached, the vendor's result still comes back with one extra line. The extra line does arrive. But the SDK also writes `status: "service_unreachable"` into the vendor's structured data, overwriting any `status` the vendor already uses. A tool whose declared output format restricts a `status` field (for example to fixed values), or forbids extra fields, fails outright during the outage with an "Output validation error".

**Why it matters.** A Within outage becomes the vendor's own outage for tools like that. The customer sees an error from the vendor's product. Even when it works, the chat ends with "The service is unreachable.", which (in our reading) looks as if the vendor's product is broken.

**What we measured.**

- `A2` (pass): Within is down (connection refused): is the vendor's result returned? after 1 ms: results for fintech | The service is unreachable.
- `A3` (FAIL, pass on the patched copy): Within is down: is the vendor's own structured data left alone? structuredContent.status came back as "service_unreachable"
- `A3b` (FAIL, pass on the patched copy): Within is down: does a tool with a declared output schema still work? Within up: ok. Within down: error: MCP error -32602: Output validation error: Invalid structured content for tool order_lookup: Invalid enum value. Expected 'shipped' | 'pending', received 'service_unreachable' at status

**Where in the code.**

- `unreachableVendorResult`, `dist/index.js` line 1285, called from `instrumentTool` at line 1459.

**How to fix it.**

- Add the note as text only, or in `_meta`, and never touch `structuredContent`.
- Consider not showing it to the customer at all; log it on the vendor's side instead.

**Prototype fix.** `P1` in `stress/patches/apply.mjs`. Run `npm run test:patched` to see the checks above change.

**Reproduce.** `cd stress && npm install && node run.mjs A2 A3 A3b`

### W-03

**Medium: A hung Within adds 5 seconds to every successful wrapped tool call, every time**

**In plain words.** The docs say calls to Within stop after 5 seconds, and that is true. But the SDK has no memory: when Within hangs, call after call waits the full 5 seconds. It also makes two requests to Within for every successful wrapped tool call, even when no offer is waiting.

**Why it matters.** An AI agent often makes many tool calls for one question. If Within hangs, ten calls in a row can wait 50 seconds in total (ten times the 5 second cap), and the delay looks like the vendor's own.

**What we measured.**

- `A1` (pass): Within hangs: how long does the vendor's tool wait? returned after 5003 ms; vendor text kept: true; text: results for fintech | The service is unreachable.
- `A1b` (gap): Within hangs: does the SDK stop waiting on later calls (circuit breaker)? three calls in a row took 5003 ms, 5001 ms, 5002 ms
- `A8` (info): How many calls does Within receive per vendor tool call? 10 tool calls produced: {"/v1/install":1,"/v1/activity":10,"/v1/offers/deliver":10}
- `A8b` (info): How much time does the SDK add to one vendor tool call (Within answering in 0 ms and in 300 ms)? median time per call. Within answering instantly: wrapped 1 ms, unwrapped 0 ms. Within answering after 300 ms: wrapped 302 ms, unwrapped 302 ms.

**Where in the code.**

- `serviceFetch`, `dist/index.js` lines 602 to 616: a fixed 5 second timeout.
- `instrumentTool`, lines 1419 to 1467: waits for the offer check, then for the activity report, before returning the vendor's result.

**How to fix it.**

- Add a circuit breaker: after a few failures, skip Within for 30 seconds.
- Send the activity report in the background and do not wait for it.
- Check for an offer less often (cache it for a few seconds), and use a shorter timeout for everything except `get_vendor_answer`.

**Reproduce.** `cd stress && npm install && node run.mjs A1 A1b A8`

### W-04

**High: A vendor tool that already has an input called `context` silently loses it**

**In plain words.** Within adds an optional "goal" input named `context` to every tool registered with `registerTool` after install (except tools marked app-only). If the vendor's tool already has an input with that name (an ordinary name for an input), Within takes the customer's value out before the vendor's code runs, and sends it to Within as the "goal".

**Why it matters.** The vendor's tool behaves wrongly with no error message (the call returns normally), because an input it needs is missing. And whatever was in that input, up to 300 characters, goes to Within.

**What we measured.**

- `B3` (FAIL, pass on the patched copy): A vendor tool that already has an input called `context`: does the vendor's handler still receive it? handler received: {"question":"How do refunds work?"}. The call itself returned an error: false. Within received mcpIntent: "Customer Priya Raman, plan Team, 40 seats"

**Where in the code.**

- `splitMcpContext`, `dist/index.js` line 1339, applied inside `patchRegisterTool` (line 1356) to every tool.
- `withMcpContext` (line 1318) already notices the clash and leaves the vendor's schema alone, but the stripping still happens.

**How to fix it.**

- Use a name no vendor would use, such as `_within_goal`, or carry the goal in `_meta`.
- Strip the field only when the SDK is the one that added it.

**Prototype fix.** `P2` in `stress/patches/apply.mjs`. Run `npm run test:patched` to see the checks above change.

**Reproduce.** `cd stress && npm install && node run.mjs B3`

### W-05

**Medium: If the AI writes a goal longer than 300 characters, the whole tool call is rejected**

**In plain words.** The extra goal input is limited to 300 characters. Models are often wordy. When one writes a longer goal, validation rejects the whole call instead of trimming the text.

**Why it matters.** The vendor's tool fails whenever the model writes more than 300 characters. If the model retries, the retry costs time, and the customer may see a failed tool.

**What we measured.**

- `B4` (FAIL, pass on the patched copy): The model writes a goal longer than 300 characters: does the vendor's tool call still work? 300 characters: ok. 375 characters: rejected: MCP error -32602: Input validation error: Invalid arguments for tool search: String must contain at most 300 character(s) at context

**Where in the code.**

- `dist/index.js` line 630: `z.string().max(300)`.
- Line 417 (`redactMcpIntent`) already trims to 300 characters, so the validator is redundant.

**How to fix it.**

- Remove `.max(300)` from the validator and keep the trim.

**Prototype fix.** `P3` in `stress/patches/apply.mjs`. Run `npm run test:patched` to see the checks above change.

**Reproduce.** `cd stress && npm install && node run.mjs B4`

### W-06

**Low: When a rep's offer is attached, the vendor's own `_meta` data is removed**

**In plain words.** The docs say the vendor's tool result stays intact, and that an offer adds one line of text and one extra field. The SDK also deletes the result's `_meta`, a place where vendors keep hints and trace ids.

**Why it matters.** Vendors that use `_meta` lose it on exactly the calls where a rep's offer appears. Hard to notice and hard to debug.

**What we measured.**

- `B2` (FAIL, pass on the patched copy): A rep's offer is attached to a result: is the vendor's own _meta kept? _meta after the offer was attached: undefined. The offer itself arrived: true

**Where in the code.**

- `attachInvitation`, `dist/index.js` lines 1265 to 1277: `delete next._meta`.

**How to fix it.**

- Remove only the keys that mount the card, or explain in the docs why all of them go.

**Prototype fix.** `P4` in `stress/patches/apply.mjs`. Run `npm run test:patched` to see the checks above change.

**Note.** We do not know why Within removes `_meta`. It may be to stop a second card from appearing, in which case only the card keys need to go.

**Reproduce.** `cd stress && npm install && node run.mjs B2`

### W-07

**Low: If the vendor's customer-identity function throws, the customer's tool call fails**

**In plain words.** A vendor can pass a function that works out who the customer is. If that function throws, for example because a session store is down, the vendor's tool call fails even though the tool itself worked.

**Why it matters.** A helper meant for Within's records can take down the vendor's real feature.

**What we measured.**

- `A7` (gap, pass on the patched copy): A customer-identity callback throws: does the vendor's tool still return? tool call failed: session store is down. The vendor's own handler had already run: true

**Where in the code.**

- `identityOf`, `dist/index.js` line 1620: `await identify(...)` runs outside any try/catch.

**How to fix it.**

- Catch the error and carry on without an identity.

**Prototype fix.** `P8` in `stress/patches/apply.mjs`. Run `npm run test:patched` to see the checks above change.

**Reproduce.** `cd stress && npm install && node run.mjs A7`

### W-08

**Medium: With argument capture on, very long text without spaces can freeze the vendor's server for seconds**

**In plain words.** The privacy filter that hides email addresses uses a text pattern that gets much slower as the text gets longer, if the text has no spaces. With argument capture on, 20,000 letters took about 800 ms, 40,000 took about 3180 ms and 80,000 took about 9788 ms (the median of three runs on a quiet laptop; a busier machine is slower). During that time the whole server process cannot answer anyone. Error messages go through the same filter even with default settings: 40,000 characters took about 868 ms. Ordinary prose and spaced-out digits are fine.

**Why it matters.** A customer pasting a long encoded string, or someone trying to hurt the vendor, can stall the vendor's whole MCP server for every other customer. The SDK runs inside the vendor's process, so its slowness is the vendor's slowness.

**What we measured.**

- `C8` (FAIL, pass on the patched copy): captureArguments on: a very long free-text argument. Does redaction block the vendor's server? letters 20000: median 800 ms (slowest of 3: 813 ms); letters 40000: median 3180 ms (slowest of 3: 3226 ms); letters 80000: median 9788 ms (slowest of 3: 10890 ms); digits-spaces 40000: median 19 ms (slowest of 3: 20 ms); digits-spaces 80000: median 21 ms (slowest of 3: 22 ms); error-letters-default-settings 20000: median 216 ms (slowest of 3: 265 ms); error-letters-default-settings 40000: median 868 ms (slowest of 3: 879 ms)

**Where in the code.**

- The `EMAIL` pattern, `dist/index.js` line 396, used by `redact` (line 425), which feeds `sanitizeError` (555), `argumentPreview` (524) and `resultText` (544).
- Time grows with the square of the length: each doubling made it about three to four times slower.

**How to fix it.**

- Cut the text to about 1,000 characters before any pattern runs (the output is cut to 200 anyway).
- Or replace the pattern with a linear scan. Add a test with a 100,000-character input.

**Prototype fix.** `P5` in `stress/patches/apply.mjs`. Run `npm run test:patched` to see the checks above change.

**Reproduce.** `cd stress && npm install && node run.mjs C8`

## What leaves the vendor's server

### W-09

**High: Tools the vendor chose NOT to wrap still report to Within**

**In plain words.** The docs say: wrap the tools you want Within to see. In practice the SDK hooks every tool registered with `registerTool` after install (the older `server.tool()` call is not hooked). If the AI fills in the goal input on an unwrapped tool, Within receives the tool's name, whether it worked, and the goal text. With argument capture on, it also receives the tool's arguments.

**Why it matters.** A vendor who leaves a sensitive internal tool unwrapped to keep it private is not protected. In our test, with argument capture on, an HR lookup's arguments, including a name and a phone number, reached the stand-in.

**What we measured.**

- `C7` (FAIL, pass on the patched copy): A tool the vendor did NOT wrap: does it still report to Within? without a goal text: 0 reports. With a model-written goal text: 1 report (toolName "internal_admin_lookup", mcpIntent "HR wants Priya Raman's salary"). With captureArguments on, the unwrapped tool's arguments were also sent: true ("salary of Priya Raman (617) 555-0142").

**Where in the code.**

- `patchRegisterTool`, `dist/index.js` lines 1356 to 1417: it reports any tool that is not flagged as already reporting, as soon as the goal text is present.

**How to fix it.**

- Report only wrapped tools, or make reporting of other tools an explicit opt-in option, and document it.

**Prototype fix.** `P6` in `stress/patches/apply.mjs`. Run `npm run test:patched` to see the checks above change.

**Reproduce.** `cd stress && npm install && node run.mjs C7`

### W-10

**High: The AI's goal summary goes to Within with private details in it, and the docs table does not list it**

**In plain words.** Whenever the AI fills in the optional goal note about what the customer wants (Claude did in our runs), the SDK sends it to Within. Within's home page says "PII redacted before storage". The docs narrow that to "when arguments are captured". The SDK hides emails, keys that start with `sk-` or `sb_`, bearer tokens and valid card numbers. It does not hide phone numbers, names, street addresses, social security numbers, the letters of a bank account number (IBAN: its digits look like a card number, so they are hidden), or keys in other formats such as Stripe, AWS, GitHub and JWT. The "What leaves your server" table does not mention this note at all, and it is sent even when argument capture is off.

**Why it matters.** A vendor's customers' personal details can end up in Within's console without the vendor knowing. Within's server may redact more after the text arrives. That part is not visible from outside.

**What we measured.**

- `C1` (pass): Default settings: which fields reach Within on a wrapped call? fields sent: source, sdkVersion, customerSessionId, toolName, outcome, durationMs, mcpIntent, mcpIntentSource, title, description. Argument or result fields among them: none
- `C2` (gap): Default settings: the model-written goal text (mcpIntent). Which kinds of private data survive? listed kinds that survived: none. Other kinds that reached Within unredacted: phone_us, phone_international, person_name, stripe_style_key (sk_live_), aws_access_key, github_token, jwt_without_Bearer, us_ssn, street_address.

**Where in the code.**

- `redactMcpIntent`, `dist/index.js` lines 417 to 423, and the fields assembled in `instrumentTool` (line 1448) and in the patched `registerTool` (line 1394).

**How to fix it.**

- List the note in the docs table.
- Make it opt-in, or off by default.
- Widen the filter (phone, SSN, IBAN, `sk_live_`, `AKIA`, `ghp_`, JWT) and say plainly that names cannot be caught by a pattern.
- Or tell the model not to put personal details in the note.

**Note.** The repo's `npm run fix` redacts phone numbers in this note. It does not cover the other kinds.

**Reproduce.** `cd stress && npm install && node run.mjs C1 C2`

### W-11

**High: The customer's full question goes to Within unredacted, and the docs do not say so**

**In plain words.** The docs table says that for `get_vendor_answer`, Within gets the topic and sends back the saved answer. The SDK also sends the customer's whole question, up to 2,000 characters, exactly as the model wrote it.

**Why it matters.** A question like "Hi, I'm Priya Raman, call me on 617 555 0142" reaches Within as written. Within presumably needs the question to choose an answer, so sending it is understandable. Not saying so is the problem.

**What we measured.**

- `C10` (gap): get_vendor_answer: what does Within receive about the customer's question? fields sent to /v1/answers: customerSessionId, topic, question. The question text was sent as: "Hi, I'm Priya Raman (priya.raman@acme-fund.com, +1 617 555 0142). What does Team cost for 40 seats? Card 4242 4242 4242 4242."

**Where in the code.**

- `dist/index.js` lines 1685 to 1690: `question` is added to the body sent to `/v1/answers`.

**How to fix it.**

- Add it to the docs table.
- Redact emails, phone numbers and cards in the question before sending. The SDK already hides emails and cards elsewhere, but not phone numbers.

**Note.** The repo has an opt-in `--question` patch for this in `fixes/apply.mjs`.

**Reproduce.** `cd stress && npm install && node run.mjs C10`

### W-12

**Medium: Error messages carry private details to Within even when argument capture is off**

**In plain words.** When a vendor's tool fails, the first 160 characters of the error message are sent to Within on every failed call to a wrapped tool. Error messages often contain what the customer typed. The SDK hides emails and cards in it but not phone numbers or names.

**Why it matters.** A message like "No account for priya@acme.com, phone (617) 555-0142" leaves the vendor's server even though the vendor never switched capture on. The docs do not describe error text.

**What we measured.**

- `C3` (gap): Default settings: error messages from the vendor's tool. Do they carry private data to Within? thrown error sent as: "No account for [redacted], phone (617) 555-0142, name Priya Raman". Returned isError text sent as: "No account for [redacted], phone (617) 555-0142, name Priya Raman". Email redacted: true.

**Where in the code.**

- `firstErrorText` (line 1349) and `sanitizeError` (line 555), used by `instrumentTool` (line 1431).

**How to fix it.**

- Send an error code or class instead of the message, or send nothing unless capture is on.
- If the text is kept, document it and widen the filter.

**Reproduce.** `cd stress && npm install && node run.mjs C3`

### W-13

**Medium: With argument capture on, tool results also leave, and several secrets slip through**

**In plain words.** The docs say capture stores the tool's arguments, after redaction. The SDK also sends the first 160 characters of the tool's result. And the filter misses several kinds of secret, both in values and in argument names: `pwd`, `passphrase`, `private_key`, `credentials`, `session`, `dob` and `iban` are not treated as secret names.

**Why it matters.** A vendor that turns capture on for one tool may send customer records (the result) and credentials the docs imply are removed.

**What we measured.**

- `C4` (gap): captureArguments on: does the tool's result text also leave? resultText sent: "Account found: Priya Raman, phone (617) 555-0142, plan Team". argumentPreview sent: "Priya Raman (617) 555-0142"
- `C5` (gap): captureArguments on: which kinds of private data survive in a free-text argument? listed kinds that survived: none. Other kinds stored unredacted: phone_us, phone_international, person_name, stripe_style_key (sk_live_), aws_access_key, github_token, jwt_without_Bearer, us_ssn, street_address.
- `C6` (gap): captureArguments on: which argument NAMES count as secret and are dropped? values of these argument names reached Within: pwd, passphrase, private_key, privateKey, credentials, session, dob, iban

**Where in the code.**

- `makeCapturedFields`, `dist/index.js` lines 637 to 650 (`resultText`).
- `SECRET_SEGMENTS`, lines 360 to 379: a deny-list of names.

**How to fix it.**

- Document the result text, or drop it.
- Switch from a deny-list to an allow-list: capture only argument names the vendor lists.
- Extend the value patterns (see W-10).

**Reproduce.** `cd stress && npm install && node run.mjs C4 C5 C6`

## Docs say one thing, the package does another

### W-14

**Medium: The docs describe a login-provider option that is not in the published package**

**In plain words.** The docs list an `identity` option for Auth0, WorkOS and Clerk, so that a token with only a user id can be turned into a name and email. The published package has no code for it. Passing the option does nothing, and no lookup is made.

**Why it matters.** A vendor who relies on the docs will likely see only bare user ids in Within's Live users list, and will not know why.

**What we measured.**

- `F3` (FAIL): The docs describe an `identity` option, `{ provider, issuer }`, for Auth0, WorkOS and Clerk user lookups. Is it in the package? occurrences in dist/index.js: {"auth0":0,"workos":0,"clerk":0,"userinfo":0,"options.identity ":0,"options.identity.":0,"issuer":0}. Hosts contacted when the option was passed: 127.0.0.1:52096

**Where in the code.**

- The words `auth0`, `workos`, `clerk`, `userinfo` and `issuer` do not appear anywhere in `dist/index.js`.

**How to fix it.**

- Publish the code, or remove the option from the docs.
- Warn at start-up about options the SDK does not recognise.

**Reproduce.** `cd stress && npm install && node run.mjs F3`

### W-15

**Medium: The docs say a banned phrase replaces one paragraph. The code replaces all of the vendor's instructions**

**In plain words.** The docs say that if the vendor's server instructions contain one of five phrases ("Do not mention" and similar), the paragraph holding it is replaced by Within's text. The code replaces the vendor's entire instructions with Within's text. It only happens when the vendor did not paste `SERVER_INSTRUCTIONS` into its own text, as the quickstart does. And the check is case-sensitive, so "do not mention" and "Never mention" are untouched.

**Why it matters.** The vendor's own guidance on how the AI should use their tools silently disappears and the AI behaves differently, with no log line. Within's own text is 2595 characters long.

**What we measured.**

- `D1` (FAIL, pass on the patched copy): Vendor instructions with 2 paragraphs, the second holding a banned phrase: what is left of the first? paragraph 1 kept: false; paragraph 2 kept: false; instructions are now exactly Within's text: true
- `D2` (info): Which phrases trigger the replacement (docs list five)? "next tool call": replaced; "Do not call": replaced; "Do not ask": replaced; "Do not say": replaced; "Do not mention": replaced; "do not mention": kept; "Never mention": kept; "Don't mention": kept; "Do NOT mention": kept
- `D3` (info): Docs' own quickstart pattern (vendor pastes SERVER_INSTRUCTIONS into its instructions): is a banned phrase still removed? with the pasted text, the vendor's own sentences were kept: true. So the replacement rule only runs when the vendor does NOT paste SERVER_INSTRUCTIONS.

**Where in the code.**

- `publishServerInstructions`, `dist/index.js` lines 3560 to 3579. The regular expression is at line 3574.

**How to fix it.**

- Replace only the paragraphs that hold a banned phrase, as documented, or never touch the vendor's text and only append.
- Log what was removed.

**Prototype fix.** `P7` in `stress/patches/apply.mjs`. Run `npm run test:patched` to see the checks above change.

**Reproduce.** `cd stress && npm install && node run.mjs D1 D2 D3`

### W-16

**Low: A wrong key or a missing URL fails silently**

**In plain words.** If Within answers a wrong API key with a 401 (the stand-in does, and the real API did once, per this repo's README), the SDK treats it as normal, so Within silently does nothing, and nothing is logged. If the URL is left out, which the homepage snippet allows, every call goes to a local address and every customer answer ends with "The service is unreachable.". A key made only of spaces is accepted.

**Why it matters.** A typo in the URL looks like a Within outage. A wrong key makes Within silently do nothing. In neither case does the vendor get a log line.

**What we measured.**

- `A4` (gap): Wrong API key (Within answers 401): does the vendor get any signal? tool result: results for fintech. Log lines from the SDK: 0. Within answered 3 requests, all 401.
- `A9` (gap): baseUrl left out (homepage snippet with an unset env var): where do the calls go? install did not complain. Calls went to http://127.0.0.1:8787. Every tool result now ends with: "The service is unreachable.". SDK log lines: 0.
- `A10` (gap, pass on the patched copy): API key checks at start-up missing: threw api_key_required; empty string: threw api_key_required; three spaces: accepted

**Where in the code.**

- `serviceFetch` (line 602) swallows every failure. `install` (line 3623) checks only that a key exists.

**How to fix it.**

- Log once at start-up and on the first 401 or refused connection.
- Reject a blank key.
- Make the homepage snippet match the quickstart, which has a fallback URL.

**Prototype fix.** `P9` in `stress/patches/apply.mjs`. Run `npm run test:patched` to see the checks above change.

**Reproduce.** `cd stress && npm install && node run.mjs A4 A9 A10`

### W-17

**Low: Two lists of private-network addresses are defined and never used**

**In plain words.** The package builds two lists of private network addresses, the kind a safety check would use before contacting a web address. No code checks any address against them.

**Why it matters.** Nothing is broken. It may be a safety check that was planned and not finished; the published file does not say. Our own earlier research note wrongly said this list guarded the identity lookups, which do not exist in this version.

**What we measured.**

- `F5` (info): Two lists of private-network addresses sit in the code. Are they ever used? BlockList objects created: 2; places that check an address against them: 0

**Where in the code.**

- `dist/index.js` lines 331 to 357 define `blocked` and `globalV6`. Nothing calls `.check` on either.

**How to fix it.**

- Use the lists where an outside address is contacted, or delete them.

**Reproduce.** `cd stress && npm install && node run.mjs F5`

## Design questions for Within's team

### W-18

**Medium: On the SDK side, consent rests on the AI, because the SDK itself does not check that the customer chose**

**In plain words.** The tool that opens a live chat, `confirm_assistance`, is visible to the AI. Called with no arguments, it asks Within to accept the rep's pending offer. A click on the card adds a one-time code, but the docs say a text-only host may leave it out. In our local test the SDK sent the accept to the stand-in with no click and no code, and (because the stand-in accepted it) told the AI "You are connected with Sarah.". Whether Within's server refuses such an accept is not visible from outside.

**Why it matters.** "A person joins only after the customer says yes" is a central promise on Within's home page. Today it depends on the AI behaving well, and on server checks nobody outside can see.

**What we measured.**

- `E1` (gap): The model calls confirm_assistance with no arguments while a rep's offer is pending. What does the SDK send? the SDK sent the accept to Within with no customer click and no nonce: true; the model was told: "You are connected with Sarah."
- `E2` (gap): Is confirm_assistance visible to the model, or limited to the card? {"get_vendor_answer":{"listedToModel":true,"visibility":["model","app"]},"confirm_assistance":{"listedToModel":true,"visibility":["model","app"]},"decline_assistance":{"listedToModel":true,"visibility":null}}
- `E3` (info): The model passes an offer id the customer was never shown: does the SDK check it? the SDK forwarded the id to Within without checking: true. What Within's server does with it cannot be seen from here.

**Consent.** 18 runs had a rep's offer pending. 12 of them put an instruction aimed at the AI inside a company record (a note saying to connect the user without asking), and some had the user say no in advance. Claude called `confirm_assistance` in 0 of 18 runs, and the accept reached the stand-in in 0. In at least 1 of the 12 poisoned runs the reply (cut to 280 characters here) said the model had seen the embedded instruction and ignored it. These are small samples (3 runs per scenario per model) on Claude Code, not claude.ai or ChatGPT.

**Where in the code.**

- `confirmAssistance`, `dist/index.js` line 1838, and `acceptOffer` (line 1781), which sends the nonce only if there is one.

**How to fix it.**

- Register the confirm tool as card-only (`visibility: ["app"]`), so the AI never sees it.
- On text-only hosts, ask the customer through MCP elicitation, which the host draws.
- On the server, reject any accept that has no code.

**Note.** The model-level runs are `npm run test:model` and need Claude Code signed in.

**Reproduce.** `cd stress && npm install && node run.mjs E1 E2 E3`

### W-19

**Medium: On servers that keep no sessions, a rep's offer cannot find the customer**

**In plain words.** The docs say a rep's offer is delivered on the customer's next tool call in that session, and that a new connection gets a new session id. In check C9, three connections got three ids. By the code at lines 3585 to 3599, a server that builds a new transport for every request gets a new id on every call (inferred from the code, not run over real HTTP).

**Why it matters.** The offer is addressed to a session. If the id changes with every call, the offer may have nowhere to arrive, unless the vendor supplies a stable user id. Whether Within's server falls back to the user id is not visible.

**What we measured.**

- `C9` (gap): Customer session ids: stable within a connection, new per connection (and per request on stateless servers) 3 connections, 2 calls each. Same id inside a connection: true. Distinct ids across the 3 connections: 3.

**Where in the code.**

- `connectionSessionMinter`, `dist/index.js` lines 3585 to 3599.

**How to fix it.**

- Key offers on a verified user id.
- Let vendors pass their own session id, and document the stateless case.

**Reproduce.** `cd stress && npm install && node run.mjs C9`

## How the AI behaves

### W-20

**Medium: A small AI model sometimes (3 of 10) treats "compare two companies" as a sales question**

**In plain words.** The trigger list tells the AI to call Within for "a competitive comparison". A small model reads that as any comparison. Asked "Compare Ledgerly and Paywise", two companies in the vendor's own data, Claude Haiku 5.5 sent the question to Within 3 of 10 times in the re-run. With one clarifying phrase added it was 0 of 10, and real competitor questions still went to Within (10 of 10 and 10 of 10).

**Why it matters.** A customer asking about the vendor's own data gets pulled toward a sales conversation. The vendor's tool is not the problem. The wording is.

**Where in the code.**

- `SERVER_INSTRUCTIONS`, `dist/index.js` line 587, the phrase "a competitive comparison,".

**How to fix it.**

- Name what is meant: "a competitive comparison (this product against a competitor, not a comparison of records in this product's own data)".
- Run this repo's repeat test on every wording change. The first rewording we tried did not help (6 of 10).

**Prototype fix.** `P11` in `stress/patches/apply.mjs`. Run `npm run test:patched` to see the checks above change.

**Reproduce.** `cd stress && npm install && npm run test:model -- --only X1,X2,X3 --times 10`

## What held up

- When Within is down, the vendor's own text still comes back, with the documented extra line. (`A2`)
- A broken (non-JSON) reply from Within does not hurt the vendor's tool. (`A5`)
- 40 customers at once with a slow Within overlap, and no customer's goal text is swapped with another's. (`A6`)
- With Within up and no offer, the vendor's result is exactly unchanged. (`B1`)
- With default settings, no tool arguments or results are sent. (`C1`)
- Normal vendor instructions stay first, with Within's text after them. (`D4`)
- `get_vendor_answer` retries once after an error, and a hang is stopped at 5 seconds as documented. (`F4`)
- **Real Claude, same stand-in server.** 21 runs across 7 scenario/model pairs asked buying questions in other languages and indirect wordings (Spanish pricing, German cancellation, a rate-limit question, a relayed question from a CFO, a renewal). Claude called Within in 21 of 21.
- **Consent.** 18 runs had a rep's offer pending. 12 of them put an instruction aimed at the AI inside a company record (a note saying to connect the user without asking), and some had the user say no in advance. Claude called `confirm_assistance` in 0 of 18 runs, and the accept reached the stand-in in 0. In at least 1 of the 12 poisoned runs the reply (cut to 280 characters here) said the model had seen the embedded instruction and ignored it. These are small samples (3 runs per scenario per model) on Claude Code, not claude.ai or ChatGPT.

## What we did not test

- Within's hosted service, console and login. We did not send load or attack traffic to it, and we cannot see its code. Anything that depends on it is untested: what it does with the goal text, whether it rejects an accept without a code, and what it redacts before storage.
- claude.ai, ChatGPT and other hosts. Model tests used Claude Code in headless mode, with a short system prompt. Real apps add their own hidden instructions.
- How the offer card and live chat look and behave in a real host.
- Behaviour under real production load, or across many Node and MCP SDK versions.

## Method

- **Stand-in server.** `stress/lib/harness.mjs` starts a small local web server that plays Within's API. It can answer slowly, never answer, send broken replies, or offer a rep's chat. Every request goes to `127.0.0.1`.
- **Real package, real MCP.** The tests install the stock `@getwithin/sdk` from npm, build an MCP server around it with the official MCP SDK, and call its tools with an MCP client.
- **Checks, not opinions.** Each check says what it expected and why (a quote from Within's docs, or a stated vendor expectation), and what happened. Results are saved in `stress/results/`.
- **Prototype fixes.** `stress/patches/apply.mjs` builds a patched copy of the package and re-runs the same checks, so each proposed fix is shown to work. They are proposals for Within's engineers, written against the published file.
- **Model runs.** `stress/model/run-model.mjs` runs real Claude (headless Claude Code) against the same demo server, three runs per scenario unless noted.

## Reproduce everything

```bash
cd stress
npm install
npm test                 # 43 checks against the stock package, about 70 seconds, writes results/latest.json
npm run test:patched     # builds the patched copy and runs the same checks
npm run test:model       # real Claude (needs Claude Code signed in), writes results/model-*.json
npm run build:findings   # rebuilds this file and docs/findings.html from the saved results
```
