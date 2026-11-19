# TDD evidence — VNeTraffic daily cache

Plan: [2026-10-29-vnetraffic.md](superpowers/plans/2026-10-29-vnetraffic.md). Journeys derived from the user's complete requirements: open once per day, retain cache after restart, recover errors only on explicit retry, share a three-attempt budget, preserve stale results and expose safe diagnostics.

| Guarantee | Test/evidence | RED observed | GREEN observed |
| --- | --- | --- | --- |
| Dynamic nonce, mappings, strict identity/response, timeout and classified errors | tests/source.test.js | 4 tests failed: createVneSource absent | All 6 source tests pass after implementation and extra regression checks |
| Daily cache/failure latch, 3 attempts, restart, dedup, old results and max20 logs | tests/daily.test.js | Initial 6 failed: ensureDaily absent | All 11 daily tests pass |
| Stable record IDs ignore plate formatting/status/key order | source.test.js | vne-4f6f… differed from vne-9da7… | Normalize plate inside identity hash; test passes |
| Reject nonempty malformed found records | source.test.js | success !== error for violations:[{unexpected:true}] | Require offense text; test passes |
| Cache today's persisted success without legacy attempt metadata | daily.test.js | calls 1 !== 0 | Explicit lastSuccessAt local-day guard; test passes |
| Remove legacy scheduling, wire open-triggered updates, reject untrusted messages | tests/background.test.js | Legacy nextRunAt dependency prevented new startup tests running | 2 background tests pass after removal/wiring |
| Stale vs absent data and allowlisted copied errors | tests/ui.test.js | resultNotice/errorText absent | 2 tests pass |
| Focus on cancelled confirmation in a real Chrome page | scripts/chrome-test.mjs | activeElement id empty; later focus timeout | Re-enable cancelled trigger; foreground dashboard before keyboard test, await close handler; Chrome test passes |

Other guarantees preserved in controller/domain/CDP tests: CRUD validation, corrupt-storage recovery/export, settings validation, notifications, result disappearance as source change, immutable copies, UTF-8 CDP transport, interrupted checks and local calendar/DST boundaries.

Actual commands: rtk npm run check; rtk npm test; rtk npm run test:coverage; rtk npm run test:chrome. Current full Node suite: 47 passed, 0 failed. Logs in artifacts/. Chrome UI/lifecycle assertions: 15 passed, 0 failed; live lookup failed HTTP403, so whole Chrome command returns exit1/PARTIAL. See vnetraffic-verification.md.

No Git repository exists here; RED/GREEN evidence is recorded in this file instead of Git checkpoints. No ECC files were changed. Known gaps: no real successful found/not_found reply; no real expired-nonce server reply; native OS notifications not directly observed. Controlled fixtures do not establish successful integration.

Bổ sung0.2.1 ngày30/10/2026: luồng tab nguồn sửa403 đã lấy kết quả thật thành công;55 tests và15 ca Chrome đạt. Xem [báo cáo mới](vnetraffic-0.2.1.md).
