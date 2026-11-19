# Independent code and security review

Reviewed 2026-10-28 against the approved design and implementation plan. All project files are new; there is no git repository/diff. This review inspected application modules, manifest, HTML/CSS, unit/integration tests, and the Chrome CDP harness. It did not rerun the full suite while the implementer was writing files.

## Findings from initial review (both resolved)

### RESOLVED — MEDIUM: CDP transport corrupts UTF-8 characters across chunks

File: `scripts/cdp.mjs:41`.

`this.buffer += chunk.toString()` decodes every pipe chunk independently. Pipe boundaries do not preserve character boundaries. The browser returns Vietnamese text in JSON; when a three-byte UTF-8 character crosses two chunks, both calls replace partial bytes with replacement characters before JSON parsing. This produces flaky E2E name comparisons and corrupts diagnostic text even though the JSON remains valid.

Targeted in-process reproduction used the actual `PipeClient` with `PassThrough` streams, sent a response containing `{"text":"ộ"}`, and split its bytes after the first byte of `ộ`. Observed result: `{ text: '���' }`.

Fix: use a `StringDecoder('utf8')` or set the incoming stream encoding to UTF-8, plus a regression test that splits a Vietnamese character inside a response. Do not change the expected text.

Scoped re-review 2026-10-29: `PipeClient` now retains a `StringDecoder('utf8')` across chunks and calls `decoder.write(chunk)`. The regression in `tests/cdp.test.js` splits the three-byte encoding of `ộ` after its first byte and asserts the exact original string. Confirmed resolved by code inspection and execution of the focused tests.

### RESOLVED — MEDIUM: Invalid local schema prevents both export and reset

Files: `src/controller.js:15`, `src/controller.js:141`, `src/background.js:49`.

If persisted data has an unsupported schema or malformed settings, `initialize()` caches a rejected promise. `exportData` aliases `getState`, `clearData` goes through `transaction`, and both depend on the rejected initialization. The background additionally rejects every message when `startupError` is set. The UI can display an error but cannot follow the error's instruction to export before resetting. Reinstalling becomes the practical recovery path and removes the saved data.

Targeted reproduction used the actual controller with `store.read()` returning `{schemaVersion:99,vehicles:[]}`. Calling `initialize`, `exportData`, and `clearData` all rejected with the same “Hãy xuất bản sao trước khi đặt lại” message. No network or browser was involved.

Fix: allow an explicit raw local-data export and confirmed reset even when application initialization fails. Keep the trusted sender check, avoid automatic data deletion, and ensure successful reset reinitializes controller state and alarms.

Scoped re-review 2026-10-29: controller `exportData()` falls back to a cloned raw store read after initialization failure. Explicit `clearData()` writes a paused default state without depending on successful initialization, replaces the rejected initialization promise, and restores subsequent controller operations. Background recovery allows only export, reset and opening the official site through its startup-error guard; sender validation remains before dispatch. Reset reinitializes storage access, clears the startup error/badge and reconciles alarms. Controller and background regressions confirm raw data is retained before explicit reset, website-origin reset is denied, raw export preserves unknown fields, and adding vehicles works after reset. Native UI confirmation remains in place. Confirmed resolved.

## Scoped verification

Executed independently after the fixes:

```text
rtk proxy node --experimental-test-isolation=none --test --test-reporter=spec tests/cdp.test.js tests/controller.test.js tests/background.test.js
tests 28; pass 28; fail 0; skipped 0
```

This command exercises actual transport/controller/background modules with in-process streams and mocked Chrome APIs. It is not browser E2E evidence. The scope of this re-review was the two prior findings and their direct integration paths, not a second broad review.

## Previously reported items checked

- Read-only messages no longer reconcile/reset the scan alarm. Scheduling now runs for state mutations; scheduling operations are serialized.
- Runtime alarm/tab failures now use a badge/title warning instead of permanently poisoning startup state.
- Notifications now cover a successful change from nonempty records to an empty result without claiming a fine has been paid.

## Security observations

- No remote runtime dependencies, invented official endpoint, credentials, or production test-injection message.
- Manifest permissions are limited to storage, alarms and notifications; no unverified host permission.
- Runtime message sender ID and exact extension page URL are checked before access.
- Local storage access is restricted to trusted extension contexts.
- External/user strings use textContent; scripts are separate module files under a restrictive CSP.
- Data deletion requires a native confirmation dialog.

## Spec and quality verdict

**Spec: INCOMPLETE.** Live official-source lookup and authentication recovery are not implemented/validated; the source adapter explicitly returns unavailable. Browser startup is blocked by the environment, so UI/service-worker behavior in real Chrome remains unverified. These limits are prominently shown in the dashboard and popup; no fabricated successful lookup was found.

**Code quality: APPROVE for the implemented local foundation; both reported MEDIUM findings are resolved.** No open findings remain from this review. This does not establish Chrome stability or satisfy the incomplete official-source requirements. Full test counts, final coverage and Chrome execution status must come from the coordinator's final verification.

| Severity | Count | Status |
| --- | --- | --- |
| CRITICAL | 0 | pass |
| HIGH | 0 | pass |
| MEDIUM | 0 open (2 resolved) | pass |
| LOW | 0 | pass |
