# TDD evidence — extension foundation

Plan: [2026-10-28-extension.md](superpowers/plans/2026-10-28-extension.md). Date: 2026-10-28.

## Journeys and scope

The user can manage multiple locally stored vehicles, customize twice-daily wall-clock schedules, distinguish unsuccessful attempts from successful official results, receive deduplicated notifications and preserve/export/delete data. The actual official source has not been validated; test success fixtures are synthetic dependency injections only.

## RED → GREEN

1. Added `tests/domain.test.js` and `tests/controller.test.js` before creating production modules. The initial `rtk proxy npm test` exited 1 with `ERR_MODULE_NOT_FOUND` for the referenced `src/domain.js` / `src/controller.js`. This is missing-implementation compile-time RED, not behavioral runtime evidence. Another concurrent harness task also had its own missing module at that moment.
2. Implemented pure domain/scheduling logic and injected controller/store/source effects. A default isolated Node run initially reported only two file-level passes. These file-level counts are **not used as proof**: the environment blocks subprocess execution, producing misleading default-isolation results.
3. Reran with `rtk proxy node --experimental-test-isolation=none --test --test-reporter=spec tests/domain.test.js tests/controller.test.js`; all 16 actual named tests passed.
4. Added a behavioral regression that a previously visible record disappearing must produce a result-change notification without claiming payment. Executed the controller suite in-process: 10 passed, 1 failed, actual notice count `1 !== 2`. Updated change detection to include the transition from nonempty records to an empty source result. Reran affected suites: GREEN.
5. Root's background integration regression showed read-only messages rewriting scan alarms (`4 !== 2` create calls). After that RED, background scheduling was limited to mutations/startup/alarm execution and scheduling calls serialized. Affected background suite: GREEN.
6. Added actual failing-notifier coverage proving a successful result survives denied notification delivery and produces a visible warning. Subsequent successful delivery clears that warning.
7. Reviewer found invalid stored schemas could not be exported or reset. Added two in-process tests first: both failed (export rethrew initialization error; malformed stored vehicle was accepted). Implemented raw-data export on initialization failure, explicit paused reset that rebuilds controller initialization, stored-vehicle validation, and trusted background recovery routes. The affected controller/domain/background run passed 28 tests after the fix. Root adds the background recovery integration case separately.

No git checkpoint commits were created: the project directory and parent workspace are not git repositories. The files and evidence here preserve this run.

## Guarantees exercised

| Behavior | Tests | Type | Actual result |
|---|---|---|---|
| Plate normalization, invalid input, vehicle duplicates and edits | domain.test.js, controller.test.js | Unit | PASS |
| Exactly two valid distinct schedule times; next/day-boundary/catch-up calculations | domain.test.js, controller.test.js | Unit | PASS |
| Failure retains last successful data and unknown responses never become clear | domain.test.js, controller.test.js | Unit | PASS |
| History cap, stable fingerprints, repeat-notification suppression | domain.test.js, controller.test.js | Unit | PASS |
| Single-flight check requests, bounded network retries, paused schedule | controller.test.js | Integration, injected effects | PASS |
| Interrupted stored status recovered, successful data retained | controller.test.js | Integration, local-store fake | PASS |
| Notification failure does not lose lookup state | controller.test.js | Integration, rejecting notifier | PASS |
| Chrome local storage scope and TRUSTED_CONTEXTS access | controller.test.js, background.test.js | Integration, Chrome API fake | PASS |
| Sender validation, actual service-worker message/alarm wiring and fresh-worker reinitialization | background.test.js | Integration, Chrome API fake | PASS |
| CDP framing/error/timeout behavior | cdp.test.js | Unit, fake streams | PASS |
| Real UI, real Chrome alarms and actual CSGT lookup | scripts/chrome-test.mjs and future authenticated source verification | E2E / live source | Not established by unit tests |

## Final implementation checks at handoff

`rtk proxy npm test`: 31 tests passed, 0 failed (includes seven nested background cases and five CDP transport cases written by root).

`rtk proxy npm run test:coverage`: PASS, measured files only:

| File | Lines | Branches | Functions |
|---|---:|---:|---:|
| controller.js | 100.00% | 91.74% | 95.35% |
| domain.js | 100.00% | 93.85% | 100.00% |
| scheduler.js | 100.00% | 100.00% | 100.00% |
| source.js | 100.00% | 100.00% | 100.00% |
| storage.js | 100.00% | 100.00% | 100.00% |
| Total measured core | 100.00% | 93.19% | 97.14% |

Source coverage means the explicit unavailable adapter is exercised; it is not evidence of official-data connectivity. UI, browser wiring in a real browser and external data are outside this coverage metric.

`rtk proxy npm run check`: PASS, manifest/resource checks, 17 JavaScript syntax compilations, HTML inline-script/CSP and unsafe source checks at this handoff. Count may grow when additional test files are added.

The syntax checker initially used `spawnSync(node --check)` and correctly failed on `EPERM` instead of silently accepting status 0. It was replaced with in-process `vm.SourceTextModule` compilation using Node's experimental VM modules flag. This provides actual syntax checking without requiring process creation.

See `verification.md` and `research-source.md` for browser/source capability evidence and final whole-project results after review.
