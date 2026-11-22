# Stress test of Within's public package, within-sdk 1.0.4: what fails, what a vendor can do about it, and what Within must fix

Within sells analytics for AI tool calls. A company installs one npm package, `within-sdk`. It sits inside the company's MCP server, records every tool call, and sends a copy to Within. The package describes itself as "MCP analytics, workflow intelligence, and qualified opportunities".

This report lists what we found when we tried to break that package. Every finding has a plain-words explanation, then the technical detail, then **what a vendor can do today** with the package's own options, and **what Within must change**, shown by a patched copy that we tested.

Everything ran on our own machine against the published package, version 1.0.4, and a small stand-in for Within's server. We did not send load or attack traffic to Within's service, and we did not look at anything behind its login.

## The short version

- **In short.** 48 checks ran on Within's public package, version 1.0.4 (21 pass, 14 gap, 11 info, 2 fail). We found 11 problems: 2 High, 7 Medium and 2 Low.
- **The most serious.** One long piece of unbroken text in a customer's request freezes the company's whole AI server for about 5.8 seconds at 100,000 characters. The package's own size limit does not stop it. A vendor can avoid it today with its own redaction function, and Within can fix it by changing the order of two steps.
- **Customer data.** The package sends what customers ask for, and what the company's tools answer, to Within by default. It hides only a short list of private details, and some only when they are the whole value.
- **What a vendor can do.** 8 of the 11 problems have a fix that works today with the package's own options. 6 have a small change that Within could make, and we tested each one on a patched copy: P1 for W-01, P4 for W-04, P2 for W-05, P3 for W-06, P6 for W-07, P5 for W-10.
- **What held up.** An outage at Within does not change or slow the company's own answers, a broken reply from Within does not hurt the company's tools, 40 customers at once do not mix their data, and the company's own instructions are left alone.

Tested 2026-11-22 15:45 UTC on `within-sdk` 1.0.4 from npm (file fingerprint `544faede7251`), Node v26.13.0, MCP SDK 1.32.2. Line numbers refer to that package's files, because Within's source repository is not public.

## At a glance

11 findings: 2 High, 7 Medium, 2 Low. 48 checks on the stock package (21 pass, 14 gap, 11 info, 2 fail); the same checks on the patched copy (25 pass, 9 gap, 14 info, 0 fail).

| ID | Severity | What | A vendor can fix it today | Within's fix, tested |
|---|---|---|---|---|
| [W-01](#w-01) | High | One long run of plain letters freezes the vendor's whole server for seconds | yes (`M1`) | yes (`P1`) |
| [W-02](#w-02) | High | Private details written inside a sentence are not hidden in the goal text, in arguments, in results or in error messages | yes (`M2`) | not patched |
| [W-03](#w-03) | Medium | Tool arguments and tool results go to Within by default, and the only off switch turns all reporting off | yes (`M2`) | not patched |
| [W-04](#w-04) | Medium | Argument names such as name, address, date of birth and IP address are not treated as private | yes (`M3`) | yes (`P4`) |
| [W-05](#w-05) | Medium | When Within stops answering, later reports stay stuck behind the stuck ones, even after Within recovers | yes (`M5`) | yes (`P2`) |
| [W-06](#w-06) | Medium | A server that loads the package ignores the first request to shut down | yes (`M6`) | yes (`P3`) |
| [W-07](#w-07) | Medium | A vendor's redaction function is handed the API key and the address events go to, and changing them stops delivery silently | no | yes (`P6`) |
| [W-08](#w-08) | Medium | Every tool call on the server is reported, and none can be left out | no | not patched |
| [W-11](#w-11) | Medium | The docs' install line names a package that npm does not have | no | not patched |
| [W-09](#w-09) | Low | A missing or rejected key shows only in a log file in the home folder, and the file only grows | yes (`M4`) | not patched |
| [W-10](#w-10) | Low | Every vendor tool gets a required "context" input, and the model sees one extra tool | yes (`M7`) | yes (`P5`) |

### What the severity words mean

- **High.** Can break or corrupt a vendor's own product, or sends a vendor's customer data to Within in a normal setup, in a way the docs do not say.
- **Medium.** Breaks something the docs promise, or hurts in a less common setup, or only during an outage.
- **Low.** A paper cut: confusing or untidy, but unlikely to hurt anyone.

### What the verdicts mean

- **pass.** The package did what the README, or a reasonable vendor, would expect.
- **FAIL.** The package breaks something a vendor would reasonably expect.
- **gap.** Behaviour that is deliberate or documented in passing but leaves a risk. A decision for Within's team.
- **info.** A measurement.

![A tool call's journey through within-sdk, with the findings marked](docs/flow.svg)

## Findings

### W-01

**High: One long run of plain letters freezes the vendor's whole server for seconds**

**For a founder.** One customer pasting a very long, unbroken piece of text can freeze the company's whole AI server for several seconds, for every other customer too. It happens in the normal setup, and the package's own size limit does not stop it.

**In plain words.** The package hides email addresses with a text pattern that gets much slower as the text gets longer, when the text has no spaces. It runs on every tool argument by default. We sent one argument of unbroken letters. At 10,000 letters the whole process stalled for 71 ms, at 50,000 for 1455 ms and at 100,000 for 5773 ms. Ordinary words of the same length took 15 ms. The vendor's own tool still answered in about 2 ms, so the stall shows nowhere in the vendor's code. The pattern alone gives the same curve (55, 321, 1287 and 5158 ms for 10,000, 25,000, 50,000 and 100,000 letters).

**Why it matters.** While the process is stalled it cannot answer any customer. One customer pasting a long encoded string, or anyone trying to hurt the vendor, can stall the vendor's server for everyone else. The package runs inside the vendor's process, so its slowness is the vendor's slowness. The size limit of 10,000 bytes does not help, because it is applied after the pattern: with the limit set to 500 the stall was still 5806 ms.

**What we measured.**

- `C8` (FAIL): A long free-text argument: does redaction freeze the vendor's whole process? (event-loop stall, 4 sizes, 2 shapes) event-loop stall per argument (ms): letters 10000 chars -> 71; letters 25000 chars -> 371; letters 50000 chars -> 1455; letters 100000 chars -> 5773; words 100000 chars -> 15; dots 50000 chars -> 1293. The vendor's own tool call returned in about 3 ms each time. The freeze comes after, while the event is cleaned, and blocks every customer on the process. Cause: the email pattern in privacy.js is applied to the whole string before it is cut to the 10,000-byte limit.
- `C8b` (info): The email pattern on its own: time against input length (copy of the pattern, checked against the package file) pattern found in privacy.js unchanged: true. Letters with no @ (ms): 10000 -> 55, 25000 -> 321, 50000 -> 1287, 100000 -> 5158. Doubling the length multiplied the time by about 4.0. Ordinary words (100,000 chars): 1 ms. The same 100,000 letters cut to 10,000 first: 56 ms. An email in 100,000 spaces: 0 ms.

**Where in the code.**

- `dist/modules/privacy.js` line 176: `EMAIL_GLOBAL_RE`.
- Lines 95 and 107: `truncateString(redactSensitiveString(value), …)` runs the pattern on the whole text first, then cuts it.

**What Within should change.**

- Cut the text to the field limit before any pattern runs (patch P1).
- Or replace the pattern with one that does not rescan: it should take time in proportion to the length. Add a test with a 100,000-character input.

**What a vendor can do today** (`M1`, pass). A redaction function that cuts every string to 2,000 characters brought the stall at 100,000 letters from 6214 ms to 24 ms, because the vendor's function runs before the package's pattern. Setting the field limit alone does not help.

**Within's fix, tested** (`P1`). With the cut moved before the pattern, the stall at 100,000 letters was 76 ms.

*Earlier numbering: W-08.*

**Reproduce.** `cd stress/v104 && node checks.mjs C8 C8b`

### W-02

**High: Private details written inside a sentence are not hidden in the goal text, in arguments, in results or in error messages**

**For a founder.** A customer who types a card number or a phone number into a question can have it sent to Within unhidden. The add-on hides only a short list of patterns, and only some of them inside a sentence.

**In plain words.** The package hides a value only when it recognises the whole value, or recognises an email address or a bearer token inside text. Phone numbers, social security numbers and card numbers count only when they are the entire value. In text we sent, these went out as written: phone, ssn, card, skkey, aws, url, ip, name, address in the goal text; phone, ssn, card, skkey, aws, url, ip, name, address in a free-text argument; card, skkey, name in an error message; and card, name in the tool's result. Identity data is handled better: a user id and name are replaced by a hashed subject, but a phone number inside a free-text field of the identity data went out (617-555-0142), and so did one in the data of a conversion report (617-555-0142). The README says Within's own service applies a second redaction pass. We cannot see or test that.

**Why it matters.** A customer who types a card number or a phone number into a question sends it to Within, unless the vendor has added its own redaction. A key written with hyphens (`sk-live-…`) goes through because the pattern wants an underscore.

**What we measured.**

- `C2` (gap): The model-written context text holds private data: which kinds survive in what is sent? of 11 kinds, these leave the process unredacted in the context text: phone, ssn, card, skkey, aws, url, ip, name, address. Sent text: "Customer Jane Doe, email [redacted], phone 617-555-0142, ssn 123-45-6789, card 4111 1111 1111 1111, [redacted], key sk-live-abc123def456ghi789jkl, aws AKIAIOSFODNN7EXAMPLE, page https://internal.acme.com/orders?token=zz9"
- `C3` (gap): Error messages from the vendor's tool: do they carry private data to Within? error text sent to Within keeps: card, skkey, name. Event has error field: true.
- `C4` (gap): Does the tool's result text also leave? the result text IS sent (response field present: true). Kinds that survive in it: card, name.
- `C5` (gap): Free-text tool argument with private data: which kinds survive? survive in the sent argument: phone, ssn, card, skkey, aws, url, ip, name, address. Removed: email, bearer.
- `C11` (gap): identify returns a user id, name and email: what leaves the process? (README: hashed locally, raw never sent) raw values found in what was sent: 617-555-0142. Identity fields in the event: {"subject":"763bc036c96479891c9dfb98aaed5097d66d709d16c0fb4835a10ce5fb24e7cf"}
- `C13` (gap): reportConversion: userId hashed, metadata redacted, and where does it post? posted to /api/sdk/conversions; result {"ok":true}; raw values in the body: 617-555-0142.

**Where in the code.**

- `dist/modules/privacy.js` lines 140 to 158 and 176 to 183: the whole-value patterns (`PHONE_RE`, `SSN_RE`, `CREDIT_CARD_RE`, with `^` and `$`) and the underscore-only key pattern (`API_KEY_GLOBAL_RE`).

**What Within should change.**

- Search for phone, social security and card numbers and for keys inside text, not only when they are the whole value.
- Names and street addresses cannot be found by a pattern. Say so in the README, and make sending free text something the vendor turns on.

**What a vendor can do today** (`M2`, pass). A vendor-written redaction function that masks digit runs, keys, web addresses and IP addresses left only name, address unredacted in the arguments (names and street addresses cannot be matched by a pattern).

*Earlier numbering: W-10, W-11, W-12, W-13.*

**Reproduce.** `cd stress/v104 && node checks.mjs C2 C3 C4 C5 C11 C13`

### W-03

**Medium: Tool arguments and tool results go to Within by default, and the only off switch turns all reporting off**

**For a founder.** In a normal setup the add-on sends what customers ask for, and what the company's tools answer, to Within on every tool call. The setup page mentions this only in passing and lists no setting to stop it, short of turning off all reporting.

**In plain words.** Every tool call is reported with its arguments and its result. In our run the query `acme corp` was in the event (seen: true) and so was the result text (seen: true). The README says identity-like fields in parameters and responses are removed or redacted, which implies they are sent, but it lists no setting for leaving them out. Setting `enableTracing` to false stopped every report (0 events), and with it all the analytics. With the context and extra-tool switches off, 3 events still went out.

**Why it matters.** The vendor's customers' questions and the vendor's own answers leave the vendor's server in a normal setup. The README mentions it only in the sentence about redaction.

**What we measured.**

- `C1` (gap): Default settings: which fields of a tools/call event reach Within? top-level fields: id, sessionId, projectId, vendorSlug, eventType, timestamp, duration, sdkLanguage, sdkVersion, serverName, serverVersion, clientName, clientVersion, resourceName, parameters, response, userIntent. The vendor's tool ARGUMENTS leave by default (the query 'acme corp' is in the event: true) and so does the RESULT text (true). The README names no switch to turn argument capture off.
- `Z2` (pass): Opting out of the extra input and the extra tool (enableToolCallContext false, enableReportMissing false; tracing left on): is the vendor's tool list left as it was, and does anything still leave? tools advertised: search_companies; search_companies inputs query; call without context worked; events sent with both switches off: 3 (tracing is still on, so arguments and results still leave).
- `Z2b` (pass): enableTracing false: does anything leave, and is the vendor's server unchanged? events sent with enableTracing false: 0. Tools advertised: search_companies,get_more_tools (the extra input and tool are controlled by their own switches). Vendor result ok: true.

**Where in the code.**

- `dist/modules/tracing.js` lines 208 to 259 build the tools/call event with `parameters: { request, extra }` (the request holds the arguments) and `event.response = result`. `tracingV2.js` lines 219 to 253 do the same.

**What Within should change.**

- Make argument and result capture opt-in, and say in the README what leaves by default.

**What a vendor can do today** (`M2`, pass). A vendor can strip or mask what leaves with the `redactSensitiveInformation` option (see W-02). Turning off `enableTracing` stops everything.

*Earlier numbering: W-11, W-13.*

**Reproduce.** `cd stress/v104 && node checks.mjs C1 Z2 Z2b`

### W-04

**Medium: Argument names such as name, address, date of birth and IP address are not treated as private**

**For a founder.** The add-on hides a private detail only when the field is named with certain words, such as email or phone. A field called name, address or date of birth is sent as written.

**In plain words.** The package hides an argument's value when its name contains one of 31 listed words, for example `email`, `phone`, `token`, `password`, `ssn` or `card`. We sent 18 differently named arguments. These went out with their values as written: name, address, dob, customer, session_id, ip. The README says identity-like fields in parameters are removed or redacted.

**Why it matters.** A vendor tool with an argument named `name`, `address` or `dob` sends that personal detail to Within, unless the vendor knows the list and adds its own words.

**What we measured.**

- `C6` (gap): Which argument NAMES count as secret and are dropped? kept as written: name, address, dob, customer, session_id, ip. Removed or redacted: password, token, api_key, apiKey, secret, authorization, email, userName, ssn, phone, user_id, creditCard. README: identity-like fields in parameters are removed or redacted; these identity-like names were not: name, address, dob, ip, customer.

**Where in the code.**

- `dist/modules/privacy.js` lines 2 to 33 (the 31 words) and lines 130 to 136 (`isSecretKey` checks whether the lower-cased name contains one of them).

**What Within should change.**

- Add `address`, `dob` and `birth` to the list, and treat `name`, `ip` and `customer` as secret when they are the whole name (patch P4).

**What a vendor can do today** (`M3`, pass). The documented `privacy.redactKeys` option fixed it: with name, address, dob, customer, ip and city listed, the names still sent as written were session_id.

**Within's fix, tested** (`P4`). With the patch, the names still sent as written were session_id.

*Earlier numbering: W-30 (new).*

**Reproduce.** `cd stress/v104 && node checks.mjs C6`

### W-05

**Medium: When Within stops answering, later reports stay stuck behind the stuck ones, even after Within recovers**

**For a founder.** If Within's service stops answering for a while, the add-on can stop reporting anything to Within, and nobody is told. The company's own customers do not notice. We watched for 15 seconds after Within came back and saw no report sent.

**In plain words.** The package sends reports through one queue that runs at most five requests at a time, and a request has no time limit. We made the stand-in for Within accept requests and never answer. After 5 requests were stuck, reports for later tool calls waited behind them. Then the stand-in answered normally again. In the next 15 seconds, 0 of the 3 waiting reports were sent. The vendor's own calls were not slowed: five calls took 3, 0, 0, 0, 0 ms. We did not wait to find out when Node's own network code gives up a stuck request.

**Why it matters.** A short outage at Within can silently remove the vendor's reports for later calls. The queue holds up to 10,000 reports and then drops the oldest. Nothing reaches the vendor's own code, and the only trace is the log file.

**What we measured.**

- `A1` (pass): Within hangs: how long does the vendor's tool wait, call after call? five calls with Within never answering took 3, 0, 0, 0, 0 ms. Worst 3 ms.
- `A1c` (gap): Within hangs for a while, then recovers: does telemetry resume without a restart? Within hung on 5 requests, then answered normally. In the next 15 s after recovery, requests reaching Within: 0 (3 later reports were waiting). The vendor's own calls stayed fast. The SDK code sets no timeout on these requests, so the stuck requests keep every later event waiting. I did not wait for Node's own default limit to see when they give up.

**Where in the code.**

- `dist/modules/eventQueue.js` line 17 (`concurrency = 5`), line 64 (`activeRequests++`) and line 211 (`postEvent`, which calls `fetch` at line 215 with no `signal` and no timeout).
- Line 16: `maxQueueSize = 10000`, and line 34 drops the oldest event when the queue is full.

**What Within should change.**

- Give every request an abort signal with a time limit of a few seconds, and count a timeout as a failed send that is retried (patch P2).

**What a vendor can do today** (`M5`, pass). The package has a `fetch` option (declared in its type definitions, not in the README's table). Passing a `fetch` that adds a 1.5-second time limit let 8 requests through in the 15 seconds after Within recovered, against 0 without it.

**Within's fix, tested** (`P2`). With a 5-second limit on every request inside the package, 8 requests reached Within in the 15 seconds after it recovered.

*Earlier numbering: W-27 (new).*

**Reproduce.** `cd stress/v104 && node checks.mjs A1 A1c`

### W-06

**Medium: A server that loads the package ignores the first request to shut down**

**For a founder.** A company server that uses the add-on does not stop the first time the hosting system asks it to. It needs a second request, which slows every update of the company's server.

**In plain words.** When a hosting system wants a program to stop, it sends a signal called SIGTERM. A plain Node program exits at once (3 ms in our test). Once the package is loaded, its own handler catches the first SIGTERM, waits for its queue to empty, and does not end the program. The server was still running after 12 seconds. A second SIGTERM, sent 3 seconds after the first, ended it after 3007 ms.

**Why it matters.** Hosting systems commonly send SIGTERM first and stop the program by force later if it is still running. A server that needs a second signal slows every deploy and restart.

**What we measured.**

- `Z3` (gap): Does loading the SDK change how the vendor's process handles SIGTERM? (one signal, then a second one 3 s later) SIGTERM to a plain Node process: exited after 3 ms. To a process that called track(): still running after 12 s (force-killed). With a second SIGTERM sent 3 s after the first: exited after 3007 ms (signal SIGTERM).

**Where in the code.**

- `dist/modules/eventQueue.js` lines 122 to 129: `process.once` for `SIGINT`, `SIGTERM` and `beforeExit`, each calling a `shutdown` that runs `eventQueue.destroy()` and never exits or re-sends the signal.

**What Within should change.**

- After the queue is flushed, send the same signal again, or leave signal handling to the application (patch P3).

**What a vendor can do today** (`M6`, pass). A vendor's own handler (`process.on('SIGTERM', () => process.exit(0))`) ended the process on the first signal in 6 ms.

**Within's fix, tested** (`P3`). With the patch, the first SIGTERM ended the process in 3 ms.

*Earlier numbering: W-28 (new).*

**Reproduce.** `cd stress/v104 && node checks.mjs Z3`

### W-07

**Medium: A vendor's redaction function is handed the API key and the address events go to, and changing them stops delivery silently**

**For a founder.** The recommended way to hide private details can silently stop all reporting, and it hands the company's secret key to the company's own hiding code. Nothing tells the company.

**In plain words.** The vendor's `redactSensitiveInformation` function is applied to every string in the event except a short protected list. The list does not include the API key or the destination address. Our recording function was handed the API key (true) and the address (true). A function that replaced digit runs, a natural way to hide phone numbers, rewrote the address from `http://127.0.0.1:PORT` to `http://N.N.N.N:N`. Every send then failed, and 0 events arrived, against 2 with a function that changes nothing. The failure shows only as lines in the log file.

**Why it matters.** This is the option a vendor must use to fix W-01 to W-04. A vendor that masks numbers or web addresses can break reporting without any error in its own code. A function that writes strings to its own log would also write the API key.

**What we measured.**

- `M8` (gap): Vendor option: what a redaction function is handed. Does it see the API key and the address events go to, and what happens if it changes them? the function was handed the API key: true; the destination address: true. With a function that replaces every digit run, events reached the stand-in: 0 (against 2 with a function that changes nothing). The failure shows only as lines in the log file.

**Where in the code.**

- `dist/modules/eventQueue.js` line 46 (the vendor's function is applied first) and `dist/modules/redaction.js` lines 6 to 16 (the protected list).

**What Within should change.**

- Add `apiKey`, `ingestBaseUrl` and `vendorSlug` to the protected list (patch P6).

**Within's fix, tested** (`P6`). With the three fields protected, the function was handed the API key: false, and the digit-replacing function delivered 2 events.

**Reproduce.** `cd stress/v104 && node checks.mjs M8`

### W-08

**Medium: Every tool call on the server is reported, and none can be left out**

**For a founder.** The add-on reports every tool the company's server has. The company cannot pick which ones.

**In plain words.** `track()` instruments the whole server. A tool registered after `track()` was reported too (reports for it: 1). The package's type definitions declare 14 options. None leaves one tool out, and we found no such option in the code.

**Why it matters.** A vendor with one internal or sensitive tool has no per-tool choice. The only ways out are to redact its strings or to turn tracing off for the whole server.

**What we measured.**

- `B7` (info): A tool registered AFTER track(): is it seen by Within? late tool: has context input true; call error none; calls reported to Within 1. No error was raised at registration.
- `C1` (gap): Default settings: which fields of a tools/call event reach Within? top-level fields: id, sessionId, projectId, vendorSlug, eventType, timestamp, duration, sdkLanguage, sdkVersion, serverName, serverVersion, clientName, clientVersion, resourceName, parameters, response, userIntent. The vendor's tool ARGUMENTS leave by default (the query 'acme corp' is in the event: true) and so does the RESULT text (true). The README names no switch to turn argument capture off.

**Where in the code.**

- `dist/modules/tracing.js` wraps the server's `tools/call` handler (lines 208 to 259).

**What Within should change.**

- Offer an option to leave named tools out, and say in the README that every tool is reported.

*Earlier numbering: W-09.*

**Reproduce.** `cd stress/v104 && node checks.mjs B7 C1`

### W-11

**Medium: The docs' install line names a package that npm does not have**

**For a founder.** The install instructions on Within's website name a software package that does not exist in the public package store. A company following them gets an error.

**In plain words.** On 2026-11-22 the docs at getwith.in/docs told vendors to run `npm install @getwithin/sdk`. We asked npm for that package and it answered "not found" (404). The package Within points to as public is `within-sdk`, which npm serves (version 1.0.4). The README of `within-sdk` names `apidocs.getwith.in`, which did not answer. We could not check which page the docs mean to be current.

**Why it matters.** A vendor who follows the docs' install line gets an error and no package.

**What we measured.**

- `F6` (FAIL): The docs' install line against npm: does the package it names exist? docs page answered 200; its install line names @getwithin/sdk; npm answers 404 for that name; npm serves within-sdk 1.0.4.
- `F2` (pass): The README's install line and quickstart, run on a fresh project installed 1.0.4 with the README line; quickstart exit code 0; output [{"type":"text","text":"found x"}]; events that reached the stand-in through WITHIN_SDK_API_URL: 3. 

**Where in the code.**

- The docs page (getwith.in/docs, fetched 2026-11-22 15:38 UTC) and the npm registry (`registry.npmjs.org`).

**What Within should change.**

- Change the docs' install line to `npm install within-sdk @modelcontextprotocol/sdk`.

*Earlier numbering: W-01 (the crash itself is gone).*

**Reproduce.** `cd stress/v104 && node checks.mjs F6 F2`

### W-09

**Low: A missing or rejected key shows only in a log file in the home folder, and the file only grows**

**For a founder.** A mistyped key means Within gets nothing and nobody is told. The only trace is a growing file in a folder nobody reads.

**In plain words.** With no key and no exporter, `track()` does not complain: it writes one warning to `~/within-sdk.log`. With a wrong key (HTTP 401) the vendor's code gets no signal either: the log file holds 4 lines about the failure. The log file is never rotated or capped (it only appends), and in our test one connection and one call added 1119 bytes. The log holds no vendor data in what we sent.

**Why it matters.** A mistyped key means no analytics and no error. In a container the home folder is often not looked at.

**What we measured.**

- `A4` (info): Wrong API key (Within answers 401): does the vendor get any signal? vendor result ok=true. Lines about the failure in ~/within-sdk.log: 4. Nothing reaches the vendor's own code or console; first line: [2026-11-22T15:45:50.258Z] Failed to send event evt_3MT6kDgC0C5HBB1WGjAEQmXTGR3, retrying... [Error: {"stack":"Error: HTTP 401: {\"ok\":fals.
- `A10` (gap): No API key and no exporter at start-up: does track() complain? track() threw: no. Warning only in the log file: [2026-11-22T15:32:49.488Z] Warning: No Within apiKey provided and no exporters configured. Events will not be sent anywhere.. The vendor's process starts normally and sends nothing.
- `C12` (gap): Local log file: what does the SDK write to ~/within-sdk.log, and is it ever capped? file ~/within-sdk.log: 1119 bytes, 7 lines from one connect, one tool call and its sends. Vendor data inside it: none. Rotation or size cap in logging.js: none (it only appends). Last lines: [2026-11-22T15:33:54.432Z] Successfully sent event evt_3MT5IAQpyqCzO9atHGkrySLpq7Q | mcp:initialize | session ses_3MT5IEBBfShDlOUTATH6o2tjZS4 | acme | 0 ms | 763bc036c96479891c9dfb98aaed5097d66d709d16c0fb4835a10ce5fb24e7cf | [2026-11-22T15:33:54.432Z] Successf

**Where in the code.**

- `dist/modules/logging.js` lines 85 to 88 (`writeFileSync`, `appendFileSync`) and `dist/index.js` lines 36 to 38 (the missing-key warning).

**What Within should change.**

- Fail loudly at start-up when no key and no exporter are set, or log to the console.

**What a vendor can do today** (`M4`, pass). The `log` option takes a callback. With it, 5 lines went to the vendor's own code and 0 bytes were added to the file.

*Earlier numbering: W-16.*

**Reproduce.** `cd stress/v104 && node checks.mjs A4 A10 C12`

### W-10

**Low: Every vendor tool gets a required "context" input, and the model sees one extra tool**

**For a founder.** The add-on changes the list of tools that customers' AI assistants see: it adds an explanation box to every tool and one extra tool.

**In plain words.** After `track()`, each tool's input list gains a `context` text, marked as required, with a description that asks for 15 to 25 words. A call without it still worked in our test (required now: query, context; the server did not reject the call). A tool with no inputs becomes a tool that takes only `context`. The model also sees a new tool, `get_more_tools`, whose description tells it to check for more tools "whenever your task might benefit from specialized capabilities".

**Why it matters.** A client or model that follows the advertised list strictly has to write an explanation on every call. The tool list customers see is no longer the one the vendor wrote.

**What we measured.**

- `B5` (gap): The client leaves `context` out (it is listed as required): does the vendor's tool call still work? required inputs now: ["query","context"]. A call without context: worked.
- `B5b` (info): A vendor tool with no inputs: what does its contract become? advertised inputs: {"type":"object","properties":{"context":{"type":"string","description":"Explain why you are calling this tool and how it fits into the user's overall goal. This parameter is used for analytics and user intent tracking. YOU MUST provide 15-25 words (count carefully). NEVER use first person ('I', 'we', 'you') - maintain third-person perspective. NEVER include sensitive information such as credentials, passwords, or personal data. Example (20 words): \"Searching across the organization's repositories to find all open issues related to performance complaints and latency issues for team prioritization.\""}},"required":["context"]}. Call with {}: [{"type":"text","text":"pong"}]
- `Z1` (info): get_more_tools: what does the extra tool say, and what does a call send? description: "Check for additional tools whenever your task might benefit from specialized capabilities - even if existing tools could work as a fallback.". Inputs: ["context"]. A call returns [{"type":"text","text":"Unfortunately, we have shown you the full tool list. We have noted your feedback and will work t and is reported to Within. The model sees it as one more tool and can call it on its own.
- `Z2` (pass): Opting out of the extra input and the extra tool (enableToolCallContext false, enableReportMissing false; tracing left on): is the vendor's tool list left as it was, and does anything still leave? tools advertised: search_companies; search_companies inputs query; call without context worked; events sent with both switches off: 3 (tracing is still on, so arguments and results still leave).

**Where in the code.**

- `dist/modules/context-parameters.js` lines 17 to 53 (adds `context` and pushes it into `required`) and `dist/modules/tracing.js` line 67 (adds `get_more_tools`).

**What Within should change.**

- Do not mark `context` as required, since the server does not enforce it (patch P5).

**What a vendor can do today** (`M7`, pass). Two documented switches (`enableToolCallContext` and `enableReportMissing` set to false) left the tool list as the vendor wrote it.

**Within's fix, tested** (`P5`). With the patch, the required inputs were query.

*Earlier numbering: W-31 (new).*

**Reproduce.** `cd stress/v104 && node checks.mjs B5 B5b Z1 Z2`

## What held up

- When Within is down, the vendor's tool still returns its result. (`A2`)
- The vendor's result, `structuredContent` and `_meta` are identical to an untracked server's, with Within up or down. (`A3`)
- A broken (non-JSON) reply from Within does not hurt the vendor's tool. (`A5`)
- 40 customers at once with a slow Within overlap, and no customer's goal text is swapped with another's. (`A6`)
- A vendor `identify` function that throws does not break the vendor's tool. (`A7`)
- A vendor tool that already has an input called `context` keeps it: its handler gets the vendor's value. (`B3`)
- A goal text of 2,000 characters is accepted. (`B4`)
- The raw user id and name are not sent: a hashed subject goes out instead. (`C11`)
- The vendor's server instructions are left unchanged. (`D4`)
- A tool written with Zod 4 is tracked and called without a crash. (`F1`)
- The README's install line and quickstart run on a fresh project. (`F2`)

## What we did not test

- Real Claude, ChatGPT or any host. The package has no sales or consent flow, so there is nothing for a model to decide, except whether it calls `get_more_tools` and writes a useful `context`.
- Within's hosted service. The README says its ingestion applies an extra server-side redaction pass; we cannot see or test it.
- The exporters for Datadog, OTLP, PostHog and Sentry, and the `publishCustomEvent` function.
- How long Node's own network code waits before it gives up a stuck request (W-05). We watched for 15 seconds.
- `apidocs.getwith.in`, named in the README, did not answer. Everything here is checked against the README and the code.
- One machine, Node v26.13.0 on macOS, and the in-memory MCP transport. Not a deployed server, a container host or a real MCP client.

## Method

- **Stand-in server.** Every request goes to a small local server on `127.0.0.1` or to a stubbed `fetch`. The log file goes to a throwaway home folder.
- **Real package.** The checks use the published `within-sdk` 1.0.4 from npm, build an MCP server around it with the official MCP SDK (1.32.2), and call its tools through an in-memory client.
- **One process per check.** The package keeps one process-wide event queue, so a check that hangs Within would otherwise block every later check. The first full run, in one process, was invalid for exactly that reason, and W-05 is what that mistake revealed.
- **Mitigations and patches.** Checks M1 to M8 try what a vendor can do with the package's own options. `stress/v104/patches.mjs` builds a patched copy with six small fixes (P1 to P6), each asserted to match exactly once, and runs the same checks on it.

## Reproduce everything

```bash
cd stress/v104
npm install --ignore-scripts          # within-sdk 1.0.4 from npm
node run-all.mjs                      # the checks on the stock package, about 6 minutes
node patches.mjs                      # builds patched-sdk with fixes P1 to P6
WITHIN_PKG_DIR=$PWD/patched-sdk OUT_DIR=$PWD/out-patched RESULTS_FILE=$PWD/../results/patched-1.0.4.json node run-all.mjs
cd .. && npm run build:findings       # rebuilds this file and the web pages from the saved results
```