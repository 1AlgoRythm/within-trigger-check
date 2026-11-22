# Within's package, version 1.0.4: what still fails, what is new, and what is gone

This page is the update to [FINDINGS.md](FINDINGS.md) for the package Within points to as public. The earlier report tested `@getwithin/sdk` 0.3.0 and 0.4.0, which are different code. Every finding in that report now has an "In 1.0.4" line, and the new findings are below.

## Update 2026-11-22: version 1.0.4, the public package

**In short.** The package Within points to as public is version 1.0.4, published on 2026-07-23. It is different code from the versions 0.3.0 and 0.4.0 that this report tested before, and we missed it because we looked under the wrong name. We ran 39 checks on it (15 pass, 12 gap, 11 info, 1 fail). Of the 26 problems in this report, 7 are still there, 7 did not show up, 11 are about features that are no longer in the package, and 1 could not be tested. We also found 5 new problems, none of them High.

**The most serious one is old.** W-08 is still there and now needs no setting. One long piece of unbroken text in a customer's request freezes the company's whole AI server for about 6.3 seconds at 100,000 characters, and the time grows much faster than the length.

**Customer data.** The add-on sends what customers ask for, and what the company's tools answer, to Within by default. Only a short list of private details is hidden. Phone numbers, card numbers, names and addresses written inside a sentence go through.

**What got better.** The setup crash is gone. An outage at Within no longer changes the company's answers or slows its calls. The company's own instructions are no longer rewritten. A customer's id is turned into a code before it leaves.

### What changed

- **The package is a different one.** `within-sdk` 1.0.4 has no `report_void`, hubs, doctor command, consent flow, identity lookup or `get_vendor_answer`. It is a telemetry package: it records tool calls and sends them to Within. Its API is `track(server, vendorSlug, options)`.
- **Not carried over.** Checks E1 to E3 (consent), B6, C10 and F4 (`get_vendor_answer`) and the real-Claude trigger runs have no counterpart. The other checks were ported, and 39 ran, in `stress/v104/`.
- **Fixed or gone since 0.4.0:** W-01 (the setup crash), W-02, W-03, W-04, W-05, W-07 and W-14 did not show up; W-06, W-15, W-17, W-18, W-19 and W-21 to W-26 describe features that are not in the package.
- **Still there:** W-08, W-09, W-10, W-11, W-12, W-13, W-16.
- **New:** W-27, W-28, W-29, W-30, W-31, in their own group below.

### Where the package is available

- **Three packages, one publisher.** On 2026-11-22 at 09:38 US Eastern time, the npm user `ballyhoogroup` had published `within-sdk` 1.0.4 (npm, MIT, 2026-07-23), `@supportbridge/sdk` 0.10.4 (npm, Apache-2.0, 2026-09-24) and `@getwithin/sdk` 0.4.0 (only on npmmirror.com; npm answered "not found").
- **Within's reply.** On 2026-11-22 Within replied with a screenshot of `within-sdk` 1.0.4 marked Public, saying it is showing as public and that they were not sure why we could not access the latest.
- **The docs point elsewhere.** getwith.in/docs, fetched on 2026-11-22, still says `npm install @getwithin/sdk`. `apidocs.getwith.in`, named in the 1.0.4 README, did not answer. We do not know whether `@getwithin/sdk` and `@supportbridge/sdk` are retired.
- **What we tested.** `within-sdk` 1.0.4, installed from `registry.npmjs.org` with `npm install` (file fingerprint `544faede7251`).

## At a glance

39 automated checks ran on `within-sdk` 1.0.4 (15 pass, 12 gap, 11 info, 1 fail), 2026-11-22 15:21 UTC.

| ID | Severity in 1.0.4 | What | In 1.0.4 |
|---|---|---|---|
| W-01 | High | The docs' own install steps crash on a new project | not reproduced |
| W-02 | High | When Within is down, the vendor's own answers can be changed, or fail | not reproduced |
| W-04 | High | A vendor tool that already has an input called `context` silently loses it | not reproduced |
| W-08 | High | With argument capture on, very long text without spaces can freeze the vendor's server for seconds | still there |
| W-09 | High | Tools the vendor chose NOT to wrap still report to Within | still there |
| W-10 | High | The AI's goal summary goes to Within with private details in it, and the docs table does not list it | still there |
| W-11 | High | The customer's full question goes to Within unredacted, and the docs do not say so | still there |
| W-21 | High | With the new identity option on, the customer's login token is sent to Within on every tool call | feature gone |
| W-03 | Medium | A hung Within adds 5 seconds to every successful wrapped tool call, every time | not reproduced |
| W-05 | Medium | If the AI writes a goal longer than 300 characters, the whole tool call is rejected | not reproduced |
| W-12 | Medium | Error messages carry private details to Within even when argument capture is off | still there |
| W-13 | Medium | With argument capture on, tool results also leave, and several secrets slip through | still there |
| W-14 | Medium | The docs describe a login-provider option that is not in the published package | not reproduced |
| W-15 | Medium | The docs say a banned phrase replaces one paragraph. The code replaces all of the vendor's instructions | feature gone |
| W-18 | Medium | On the SDK side, consent rests on the AI, because the SDK itself does not check that the customer chose | feature gone |
| W-19 | Medium | On servers that keep no sessions, a rep's offer cannot find the customer | feature gone |
| W-20 | Medium | A small AI model sometimes (3 of 10) treats "compare two companies" as a sales question | not tested |
| W-22 | Medium | A new tool, report_void, is on by default, and the customer's own words in it go to Within unredacted | feature gone |
| W-24 | Medium | With the hubs feature on, text written on Within's side is added to the vendor's own tool results, and the AI repeats it to the customer | feature gone |
| W-27 | Medium | When Within stops answering, later reports stay stuck behind the stuck ones, even after Within recovers | **new** |
| W-28 | Medium | A server that loads the add-on ignores the first request to shut down | **new** |
| W-29 | Medium | Tool arguments and tool results go to Within by default, and the only off switch turns all reporting off | **new** |
| W-30 | Medium | Argument names such as name, address, date of birth and IP address are not treated as private | **new** |
| W-06 | Low | When a rep's offer is attached, the vendor's own `_meta` data is removed | feature gone |
| W-07 | Low | If the vendor's customer-identity function throws, the customer's tool call fails | not reproduced |
| W-16 | Low | A wrong key or a missing URL fails silently | still there |
| W-17 | Low | Two lists of private-network addresses are defined and never used | feature gone |
| W-23 | Low | When the AI app does not report its name, the first 80 characters of its user-agent text are sent as the app name | feature gone |
| W-25 | Low | The new doctor command passes a server whose own `context` input is being removed (W-04) | feature gone |
| W-26 | Low | The app-only hub_card tool can be called directly by any MCP client; only the host's label keeps the AI away from it | feature gone |
| W-31 | Low | Every vendor tool now lists a required "context" input, and the model sees one extra tool | **new** |

## New in 1.0.4

### W-27

**Medium: When Within stops answering, later reports stay stuck behind the stuck ones, even after Within recovers**

**For a founder.** If Within's service stops answering for a while, the add-on can stop reporting anything to Within, and nobody is told. The company's own customers do not notice. We watched for 15 seconds after Within came back and saw no report sent.

**In plain words.** The add-on sends reports to Within through one queue that runs at most five requests at a time, and the request has no time limit. We made the stand-in for Within accept requests and never answer. After 5 requests were stuck, reports for later tool calls waited behind them. Then the stand-in answered normally again. In the next 15 seconds, 0 of the 3 waiting reports were sent. The vendor's own tool calls were not slowed: they took 2, 0, 0, 0, 0 ms. We did not wait to find out when Node's own network code gives up on the stuck requests.

**Why it matters.** A short outage at Within can silently remove the vendor's reports for later calls. The queue holds up to 10,000 reports and then drops the oldest. Nothing reaches the vendor's own code, and the only trace is the log file.

**What we measured.**

- `A1` (pass): Within hangs: how long does the vendor's tool wait, call after call? five calls with Within never answering took 2, 0, 0, 0, 0 ms. Worst 2 ms.
- `A1c` (gap): Within hangs for a while, then recovers: does telemetry resume without a restart? Within hung on 5 requests, then answered normally. In the next 15 s after recovery, requests reaching Within: 0 (3 later reports were waiting). The vendor's own calls stayed fast. The SDK code sets no timeout on these requests, so the stuck requests keep every later event waiting. I did not wait for Node's own default limit to see when they give up.

**Where in the code.**

- `dist/modules/eventQueue.js` line 17 (`concurrency = 5`), line 64 (`activeRequests++`) and line 211 (`postEvent`, which calls `fetch` at line 215 with no `signal` and no timeout).
- Line 16: `maxQueueSize = 10000`, and line 34 drops the oldest event when the queue is full.

**How to fix it.**

- Give every request an abort signal with a time limit of a few seconds, and count a timeout as a failed send that is retried.
- Test it the way `A1c` does: hang five requests, recover, and check that the next report is sent.

**Reproduce.** `cd stress/v104 && node checks.mjs A1c`

### W-28

**Medium: A server that loads the add-on ignores the first request to shut down**

**For a founder.** A company server that uses the add-on does not stop the first time the hosting system asks it to. It needs a second request. That slows every update of the company's server.

**In plain words.** When a hosting system wants a program to stop, it sends a signal called SIGTERM. A plain Node program exits at once (2 ms in our test). Once the add-on is loaded, its own handler catches the first SIGTERM, waits for its queue to empty, and does not end the program. The server was still running after 12 seconds. A second SIGTERM, sent 3 seconds after the first, ended it after 3003 ms.

**Why it matters.** Hosting systems commonly send SIGTERM first and stop the program by force later if it is still running. A server that needs a second signal delays every deploy and restart. It also loses any work that the polite stop would have finished.

**What we measured.**

- `Z3` (gap): Does loading the SDK change how the vendor's process handles SIGTERM? (one signal, then a second one 3 s later) SIGTERM to a plain Node process: exited after 2 ms. To a process that called track(): still running after 12 s (force-killed). With a second SIGTERM sent 3 s after the first: exited after 3003 ms (signal SIGTERM).

**Where in the code.**

- `dist/modules/eventQueue.js` lines 122 to 129: `process.once` for `SIGINT`, `SIGTERM` and `beforeExit`, each calling a `shutdown` that runs `eventQueue.destroy()` and never exits or re-sends the signal.

**How to fix it.**

- After the queue is flushed, re-send the same signal to the process, or leave signal handling to the application and export a `shutdown()` function for it to call.
- Add a test: start a process with `track()`, send SIGTERM, and require that it exits.

**Reproduce.** `cd stress/v104 && node checks.mjs Z3`

### W-29

**Medium: Tool arguments and tool results go to Within by default, and the only off switch turns all reporting off**

**For a founder.** In a normal setup the add-on sends what customers ask for, and what the company's tools answer, to Within on every tool call. Only a short list of private details is hidden. The setup page mentions this only in passing and lists no setting to stop it, short of turning off all reporting.

**In plain words.** Every tool call is reported with its arguments and its result. In our run the query `acme corp` and the result text `found 3 for acme corp` were both in the event (argument seen: true, result seen: true). The README says that identity-like fields in parameters and responses are removed or redacted, which implies they are sent, but it does not list a setting for leaving them out. Setting `enableTracing` to false stopped every report (0 events), which also stops the analytics. 0.x kept arguments at home unless `captureArguments` was on.

**Why it matters.** A vendor's customers' questions and the vendor's own answers leave the vendor's server in a normal setup. The README mentions this only in passing, in the sentence about redaction.

**What we measured.**

- `C1` (gap): Default settings: which fields of a tools/call event reach Within? top-level fields: id, sessionId, projectId, vendorSlug, eventType, timestamp, duration, sdkLanguage, sdkVersion, serverName, serverVersion, clientName, clientVersion, resourceName, parameters, response, userIntent. The vendor's tool ARGUMENTS leave by default (the query 'acme corp' is in the event: true) and so does the RESULT text (true). In 0.x both stayed home unless captureArguments was on. There is no switch named in the README to turn argument capture off.
- `C4` (gap): Does the tool's result text also leave? the result text IS sent (response field present: true). Kinds that survive in it: card, name.
- `Z2` (pass): Opting out of the extra input and the extra tool (enableToolCallContext false, enableReportMissing false; tracing left on): is the vendor's tool list left as it was, and does anything still leave? tools advertised: search_companies; search_companies inputs query; call without context worked; events sent with both switches off: 3 (tracing is still on, so arguments and results still leave).
- `Z2b` (pass): enableTracing false: does anything leave, and is the vendor's server unchanged? events sent with enableTracing false: 0. Tools advertised: search_companies,get_more_tools (the extra input and tool are controlled by their own switches). Vendor result ok: true.

**Where in the code.**

- `dist/modules/tracing.js` lines 208 to 259 build the tools/call event with `parameters: { request, extra }` (the request holds the arguments) and `event.response = result`. `tracingV2.js` lines 219 to 253 do the same.
- `dist/modules/privacy.js` lines 90 to 107: the only filter between that event and the network.

**How to fix it.**

- Make argument and result capture opt-in, as `captureArguments` was in 0.x, and say in the README what leaves by default.
- The README lists a `redactSensitiveInformation` option for the vendor's own redaction function. We did not test whether it can remove arguments and results.

**Reproduce.** `cd stress/v104 && node checks.mjs C1 C4 Z2 Z2b`

### W-30

**Medium: Argument names such as name, address, date of birth and IP address are not treated as private**

**For a founder.** The add-on hides a private detail only when the field is named with certain words, such as email or phone. A field called name, address or date of birth is sent as written.

**In plain words.** The add-on hides a value when the argument's name contains one of 31 listed words, for example `email`, `phone`, `token`, `password`, `ssn` or `card`. We sent 18 arguments, each named differently. These went out with their values as written: name, address, dob, customer, session_id, ip. The README says identity-like fields in parameters are removed or redacted.

**Why it matters.** A vendor tool with an argument named `name`, `address` or `dob` sends that personal detail to Within. The vendor has to know the list and add its own words.

**What we measured.**

- `C6` (gap): Which argument NAMES count as secret and are dropped? kept as written: name, address, dob, customer, session_id, ip. Removed or redacted: password, token, api_key, apiKey, secret, authorization, email, userName, ssn, phone, user_id, creditCard. README: identity-like fields in parameters are removed or redacted; these identity-like names were not: name, address, dob, ip, customer.

**Where in the code.**

- `dist/modules/privacy.js` lines 2 to 33 (the 31 words) and lines 130 to 136 (`isSecretKey` checks whether the lower-cased argument name contains one of them).

**How to fix it.**

- Add `name`, `address`, `birth`, `dob`, `ip` and `session` to the default list.
- The README says the `privacy` option takes additional keys to redact. We did not test that; it should be the documented way for a vendor to add its own.

**Reproduce.** `cd stress/v104 && node checks.mjs C6`

### W-31

**Low: Every vendor tool now lists a required "context" input, and the model sees one extra tool**

**For a founder.** The add-on changes the list of tools that customers' AI assistants see: it adds an explanation box to every tool and one extra tool. Two settings switch this off.

**In plain words.** After `track()`, each vendor tool's input list gains a `context` text, marked as required, with a description that asks for 15 to 25 words. A call without it still worked in our test (query, context are required; the server did not reject the call). A tool with no inputs becomes a tool that takes only `context` (`B5b`). The model also sees one new tool, `get_more_tools`, whose description tells it to check for more tools "whenever your task might benefit from specialized capabilities" (`Z1`). Two settings turn these off: `enableToolCallContext` and `enableReportMissing` (`Z2`).

**Why it matters.** A client or model that follows the advertised list strictly has to write an explanation on every call. The vendor's tool list, as customers see it, is no longer the one the vendor wrote.

**What we measured.**

- `B5` (pass): The client leaves `context` out (it is listed as required): does the vendor's tool call still work? required inputs now: ["query","context"]. A call without context: worked. In 0.x the field was optional.
- `B5b` (info): A vendor tool with no inputs: what does its contract become? advertised inputs: {"type":"object","properties":{"context":{"type":"string","description":"Explain why you are calling this tool and how it fits into the user's overall goal. This parameter is used for analytics and user intent tracking. YOU MUST provide 15-25 words (count carefully). NEVER use first person ('I', 'we', 'you') - maintain third-person perspective. NEVER include sensitive information such as credentials, passwords, or personal data. Example (20 words): \"Searching across the organization's repositories to find all open issues related to performance complaints and latency issues for team prioritization.\""}},"required":["context"]}. Call with {}: [{"type":"text","text":"pong"}]
- `Z1` (info): get_more_tools: what does the extra tool say, and what does a call send? description: "Check for additional tools whenever your task might benefit from specialized capabilities - even if existing tools could work as a fallback.". Inputs: ["context"]. A call returns [{"type":"text","text":"Unfortunately, we have shown you the full tool list. We have noted your feedback and will work t and is reported to Within. The model sees it as one more tool and can call it on its own.
- `Z2` (pass): Opting out of the extra input and the extra tool (enableToolCallContext false, enableReportMissing false; tracing left on): is the vendor's tool list left as it was, and does anything still leave? tools advertised: search_companies; search_companies inputs query; call without context worked; events sent with both switches off: 3 (tracing is still on, so arguments and results still leave).

**Where in the code.**

- `dist/modules/context-parameters.js` lines 17 to 53: skips a tool that already has `context`, otherwise adds the property and pushes it into `required`.
- `dist/modules/tracing.js` line 67: adds the `get_more_tools` tool.

**How to fix it.**

- Do not mark `context` as required, since the server does not enforce it.
- Say in the README that the tool list changes, and which two settings undo it.

**Reproduce.** `cd stress/v104 && node checks.mjs B5 B5b Z1 Z2`

## Every earlier finding, on 1.0.4

Each line gives the status, the checks behind it, and the evidence. The full text of each finding, for 0.3.0 and 0.4.0, is in [FINDINGS.md](FINDINGS.md).

- **W-01** (High; not reproduced): The docs' own install steps crash on a new project. The package has no Zod dependency of its own and asks only for the MCP SDK (1.11 or newer). A tool written with Zod 4 was tracked and called without a crash (`F1`), and the README's own install line plus its quickstart ran on a fresh project (`F2`).
- **W-02** (High; not reproduced): When Within is down, the vendor's own answers can be changed, or fail. With Within refusing connections, the vendor's result came back, and its text, `structuredContent` and `_meta` were identical to an untracked server's (`A2`, `A3`).
- **W-03** (Medium; not reproduced): A hung Within adds 5 seconds to every successful wrapped tool call, every time. With Within never answering, five calls took 2, 0, 0, 0, 0 ms: the vendor's call no longer waits for Within. A different problem took its place, see W-27 (`A1`).
- **W-04** (High; not reproduced): A vendor tool that already has an input called `context` silently loses it. The vendor's own `context` input reaches its handler unchanged, and the SDK skips its own field for that tool and writes a warning to its log file (`B3`). The cost is that Within gets no goal text for that tool.
- **W-05** (Medium; not reproduced): If the AI writes a goal longer than 300 characters, the whole tool call is rejected. A goal text of 2,000 characters was accepted and the vendor's tool call worked (`B4`). The text is sent in full: nothing cuts it to 300 characters.
- **W-06** (Low; feature gone): When a rep's offer is attached, the vendor's own `_meta` data is removed. There is no rep's offer in 1.0.4 (the words `assistance` and `offer` appear nowhere in the code, `S1`). In the normal flow the vendor's `_meta` came back unchanged (`A3`).
- **W-07** (Low; not reproduced): If the vendor's customer-identity function throws, the customer's tool call fails. When the vendor's `identify` function throws, the vendor's tool still returns its result (`A7`).
- **W-08** (High; still there): With argument capture on, very long text without spaces can freeze the vendor's server for seconds. Still there, and now needs no setting. The same pattern runs on every tool argument by default. A call with 100,000 unbroken letters froze the process for 6252 ms, 50,000 for 1882 ms and 10,000 for 109 ms (`C8`). The pattern alone shows the same curve (`C8b`). Cutting the text to the 10,000-byte field limit happens after the pattern runs, so the limit does not help. We would now rate it High.
- **W-09** (High; still there): Tools the vendor chose NOT to wrap still report to Within. Still there, by design: there is no longer a choice to wrap a tool. Every tool call on the server is reported, including a tool registered after `track()` (`B7`). The README's configuration table lists no way to leave one tool out.
- **W-10** (High; still there): The AI's goal summary goes to Within with private details in it, and the docs table does not list it. Still there. In the model-written goal text, phone, ssn, card, skkey, aws, url, ip, name, address went out unredacted. Only emails and bearer tokens were hidden (`C2`). The README says a second pass on Within's side redacts more. We cannot test that.
- **W-11** (High; still there): The customer's full question goes to Within unredacted, and the docs do not say so. Still there, and wider: every tool argument is sent, not only the question. In a free-text argument, phone, ssn, card, skkey, aws, url, ip, name, address went out as written (`C1`, `C5`).
- **W-12** (Medium; still there): Error messages carry private details to Within even when argument capture is off. Still there. In an error message, card, skkey, name went out unredacted (`C3`).
- **W-13** (Medium; still there): With argument capture on, tool results also leave, and several secrets slip through. Still there, and now on by default: the tool's result text is sent, with card, name unredacted (`C4`). There is no argument-capture setting to leave off.
- **W-14** (Medium; not reproduced): The docs describe a login-provider option that is not in the published package. The `identify` option the README describes is in the package and works: the raw user id and name were not sent, only a hashed subject (`C11`). A phone number written inside a free-text field of the identity data still went out (see W-10).
- **W-15** (Medium; feature gone): The docs say a banned phrase replaces one paragraph. The code replaces all of the vendor's instructions. 1.0.4 does not touch the vendor's server instructions: 51 characters in, 51 out, identical (`D4`). The word `banned` appears nowhere in the code (`S1`).
- **W-16** (Low; still there): A wrong key or a missing URL fails silently. Still there. A rejected key (HTTP 401) and a missing key give no error to the vendor's code. The only trace is lines in `~/within-sdk.log`, which the code only ever appends to (`A4`, `A10`, `C12`).
- **W-17** (Low; feature gone): Two lists of private-network addresses are defined and never used. The package contains no list of private-network addresses (`F5`).
- **W-18** (Medium; feature gone): On the SDK side, consent rests on the AI, because the SDK itself does not check that the customer chose. There is no consent flow: `confirm_assistance`, `assistance`, `offer` and `nonce` appear nowhere in the code (`S1`).
- **W-19** (Medium; feature gone): On servers that keep no sessions, a rep's offer cannot find the customer. There is no rep's offer to lose on a server without sessions (`S1`).
- **W-20** (Medium; not tested): A small AI model sometimes (3 of 10) treats "compare two companies" as a sales question. 1.0.4 has no `get_vendor_answer` tool (`S1`), so the question "does the AI send a comparison to Within" does not exist in the same form. We did not run real Claude on 1.0.4.
- **W-21** (High; feature gone): With the new identity option on, the customer's login token is sent to Within on every tool call. The identity lookup is gone: `issuer`, `auth0`, `workos`, `clerk` and `userinfo` appear nowhere in the code (`S1`). The incoming request's auth information is replaced by `[redacted]` in the events we saw.
- **W-22** (Medium; feature gone): A new tool, report_void, is on by default, and the customer's own words in it go to Within unredacted. `report_void` appears nowhere in the code (`S1`).
- **W-23** (Low; feature gone): When the AI app does not report its name, the first 80 characters of its user-agent text are sent as the app name. `user-agent` appears nowhere in the code (`S1`).
- **W-24** (Medium; feature gone): With the hubs feature on, text written on Within's side is added to the vendor's own tool results, and the AI repeats it to the customer. `hubs` appears nowhere in the code (`S1`).
- **W-25** (Low; feature gone): The new doctor command passes a server whose own `context` input is being removed (W-04). `doctor` appears nowhere in the code (`S1`).
- **W-26** (Low; feature gone): The app-only hub_card tool can be called directly by any MCP client; only the host's label keeps the AI away from it. `hub_card` appears nowhere in the code (`S1`).

## What we did not test

- Real Claude on 1.0.4. It has no offer or consent flow, so the earlier trigger and consent runs have no counterpart, and W-20 is untested.
- Within's hosted service. The README says its ingestion applies an extra server-side redaction pass; we cannot see or test it.
- The exporters for Datadog, OTLP, PostHog and Sentry, and the `redactSensitiveInformation` and `privacy` options as ways to remove what W-29 and W-30 describe.
- How long Node's own network code waits before it gives up a hung request (W-27). We watched for 15 seconds.
- The documentation at `apidocs.getwith.in`: it did not answer. Everything here is checked against the 1.0.4 README and its code.
- One machine, Node v26.13.0 on macOS, and the in-memory MCP transport. Not a deployed server, a container host or a real MCP client.

## Technical notes

- **Setup.** 39 checks, each in its own process, because the package keeps one process-wide event queue and a hung check would otherwise block every later one. Node v26.13.0, MCP SDK 1.32.2, Zod 3.25.76 and 4.6.7. Every request went to a stand-in server on `127.0.0.1` or to a stubbed `fetch`; the log file went to a throwaway home folder.
- **Result.** 15 pass, 12 gap, 11 info, 1 fail. Run `cd stress/v104 && npm install --ignore-scripts && node run-all.mjs` (about 5 minutes). It writes `stress/results/sdk-1.0.4.json`.
- **The freeze, isolated.** The email pattern in `privacy.js` line 176, run alone on letters with no `@`: 10,000 characters took 55 ms, 25,000 took 358 ms, 50,000 took 1463 ms, 100,000 took 5879 ms. Ordinary words of the same length: 1 ms. The same letters cut to 10,000 first: 60 ms (`C8b`).
- **Checked by reading.** `S1` searches the 30 `.js` files of the package for the 0.x feature names and records the counts.
- **The first full run was wrong.** Checks that shared one process saw no events after an earlier check had hung Within. Running each check in its own process fixed it, and W-27 is what that mistake revealed.

## Reproduce

```bash
cd stress/v104
npm install --ignore-scripts   # within-sdk 1.0.4 from npm, MCP SDK 1.32.2, Zod 3.25.76 and 4.6.7
node run-all.mjs               # all checks, about 5 minutes, writes stress/results/sdk-1.0.4.json
node run-all.mjs C8 Z3         # only these, merged with the saved output of the others
cd .. && npm run build:findings   # rebuilds FINDINGS.md, FINDINGS-1.0.4.md and the two web pages
```