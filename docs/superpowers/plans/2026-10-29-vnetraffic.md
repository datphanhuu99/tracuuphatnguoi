# VNeTraffic daily lookup implementation plan

Goal: implement the user's supplied specification within the existing MV3 architecture.
Architecture: background owns all network calls and local state; popup/dashboard send messages and subscribe to storage. No new dependencies or remote executable code.

Design decisions: automatic lookup is triggered only by Chrome startup or opening an extension page. One automatic attempt per local calendar day; success is cached and errors require explicit retry. All network attempts (including failed nonce retrieval) consume the shared three-attempt daily budget. Manual retry may refresh a successful result within the same budget. Count an attempt on the date it starts; count success on the date it completes. Persist identity-keyed budgets so editing/deleting/re-adding a vehicle cannot silently reset them. Persist before networking and recover interrupted checks as errors, never automatically retry them that day. No alarms or daily summaries; clear legacy alarms during upgrade.

- [x] Connector tests RED: dynamic JSON nonce, fixed endpoint, three vehicle mappings, response identity/structure, stable record IDs, classified failures, bounded timeout and no retry.
- [x] Connector GREEN: source.js and domain.js normalize trusted result metadata and sanitized diagnostics.
- [x] Controller tests RED: local-day cache, failure latch, three-attempt budget, concurrent triggers, restart/interruption, identity edits, stale results, 20-error cap.
- [x] Controller GREEN: serialize durable attempt claims and keep one in-flight promise per identity; migrate v1 state without deleting results.
- [x] Background/UI tests RED/GREEN: remove scheduling; opening triggers automatic checks without blocking state rendering; explicit retries and safe error copy in both views.
- [x] Verify: npm run check, npm test, npm run test:coverage, Chrome tests and live 51K999999 motorcycle lookup from unpacked extension. Document actual evidence and limitations.

Review focus: midnight/DST uses local dates; restart cannot repeat attempts; popup closure does not own fetch; expired nonce never refreshes automatically; malformed/identity-mismatched response never becomes clear. No Git checkout is present, so preserve RED/GREEN evidence in docs instead of checkpoint commits.

Outcome: implementation/verification steps executed; live integration remains unaccepted because the actual extension POST received HTTP403. See docs/vnetraffic-verification.md.
