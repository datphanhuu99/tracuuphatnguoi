# Phạt nguội extension implementation plan

**Goal:** Build and repeatedly test a local Chrome MV3 extension with twice-daily scheduling, vehicle management, daily summaries and explicit authentication recovery.

**Spec:** ../specs/2026-10-28-phat-nguoi-design.md

**Architecture:** Native HTML/CSS and JavaScript ES modules, no remote runtime dependencies. Service worker owns all writes and alarms. Source adapter separates verified CSGT behavior from deterministic test fixtures. Browser tests load the actual unpacked extension in a temporary Chrome profile.

**Execution:** User explicitly requested agents to run Chrome tests autonomously until stable. Proceed without another execution-choice prompt. Workspace is a new, empty project directory, not a git repository; keep evidence files rather than manufacturing git history. Native TaskList is unavailable; this plan and progress.md are the task tracker.

## Global constraints

- Work only in tracuuphatnguoi; leave sibling test/ and ECC/ unchanged.
- Local-only storage, no credentials, no fabricated official API or successful lookup.
- Never interpret network, authentication or unrecognized-page failures as no violations.
- Real source access and authenticated lookup must be reported separately from synthetic tests.
- Use rtk for shell commands and tests first for core behavior. Do not delegate recursively.

## Task 1: Validate browser and official-source capabilities

**Files:** docs/research-source.md, temporary Chrome probe under /tmp.

- [ ] Inspect actual CSGT page, form, auth and result format without querying an unrelated vehicle.
- [ ] Establish Chrome 150 extension loading with CDP and a temporary profile.
- [ ] Document reachable URLs, observed failures and precise limits.

## Task 2: Implement extension and unit/integration tests

**Files:** manifest.json, package.json, src/{domain,storage,scheduler,controller,source,background}.js, src/{app,popup}.html, src/{app,popup}.js, src/styles.css, icons/, tests/*.test.js, scripts/check.mjs, README.md.

**Acceptance:** Add/edit/delete multiple vehicles; normalize plates, reject duplicates; two distinct configurable daily times (08:00/20:00 defaults); pause, check-now, catch-up, single-flight checks; persisted successful results retained on error; bounded history; notification deduplication, daily summary, export and delete; local storage access restricted. Vietnamese accessible UI, no inline scripts, limited host permissions.

- [ ] Write node:test cases for plate validation, same-day/next-day schedules, catch-up, failure preservation, deduplication, and settings validation. Run them and record RED evidence before implementations.
- [ ] Implement domain and controller with dependency-injected storage/source/clock/notifier so failure and race behavior can be tested without internet.
- [ ] Implement service worker and source adapter according to Task 1 findings. If source cannot be verified, expose a clear unavailable/auth-required status and an official-site recovery action; do not claim automatic lookup works.
- [ ] Build a restrained Vietnamese dashboard (warm off-white, dark green, amber status, prominent actual freshness), compact popup and settings. Show last attempt and last success separately. Render all external data using textContent.
- [ ] Run `npm test`, `npm run test:coverage`, `npm run check`. Preserve actual RED/GREEN evidence in docs/tdd.md. Node built-in runner avoids installation dependencies.

## Task 3: Real Chrome end-to-end harness and stabilization

**Files:** scripts/chrome-test.mjs, tests/browser fixtures if needed, docs/verification.md, test artifacts under artifacts/.

- [ ] Launch temporary Chrome profile, load actual manifest, assert service worker starts without errors.
- [ ] Exercise UI creation, validation, duplicate prevention, edit, reload persistence, settings, pause/resume, check-now errors/auth, export, deletion and popup.
- [ ] Test actual alarm API creation/delivery and worker restart; simulated sources must exist only in harness, not production message APIs or alternate official URLs.
- [ ] Include keyboard accessibility and narrow layout checks, screenshot evidence, repeat independent runs to detect flakiness.
- [ ] Review all code against spec and ECC review guidance; fix high-impact findings and rerun affected suites.
- [ ] Write exact commands, counts, coverage scope and source-access limitations. No broad stability claim from mocked tests.

## Finish criteria

Local functional checks pass in Chrome and documented limits remain visible. Report an installable local build and reproduction commands. If real CSGT lookup cannot be validated, explicitly mark that requirement incomplete rather than reporting full completion.
