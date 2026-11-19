import { createVneSource, LOOKUP_PAGE } from './source.js';
import { diagnostic, ERROR_MESSAGES } from './errors.js';

const TAB_KEY = 'vneLookupTabs';

/** Keep the POST in the site's own origin. Background still owns budgets and results. */
export function createPageSource({ tabs, runtime, registry, timeoutMs = 25000, clock = Date.now }) {
  let changes = Promise.resolve();
  function updateTabs(update) {
    if (!registry) return Promise.resolve();
    const work = changes.then(async () => {
      const saved = await registry.get(TAB_KEY);
      await registry.set({ [TAB_KEY]: update(Array.isArray(saved[TAB_KEY]) ? saved[TAB_KEY] : []) });
    });
    changes = work.catch(() => {});
    return work;
  }
  async function cleanup() {
    if (!registry) return;
    const saved = await registry.get(TAB_KEY);
    for (const id of Array.isArray(saved[TAB_KEY]) ? saved[TAB_KEY] : []) {
      try {
        const tab = await tabs.get(id);
        // Never close a user's tab after they have navigated away from our lookup page.
        if (tab.url === LOOKUP_PAGE) await tabs.remove(id);
      } catch { /* An already-closed temporary tab needs no recovery. */ }
    }
    await registry.set({ [TAB_KEY]: [] });
  }
  async function lookup(vehicle) {
    const start = clock();
    let tab;
    let timer;
    let resolveReady;
    let rejectReady;
    const seen = new Set();
    const ready = new Promise((resolve, reject) => {
      resolveReady = resolve; rejectReady = reject;
      timer = setTimeout(() => reject({ code: 'TIMEOUT' }), timeoutMs);
    });
    // Avoid an unhandled rejection while Chrome is still resolving tabs.create.
    ready.catch(() => {});
    const onReady = (message, sender) => {
      if (message?.type !== 'vne:ready' || sender.id !== runtime.id || sender.url !== LOOKUP_PAGE || !Number.isInteger(sender.tab?.id)) return false;
      seen.add(sender.tab.id);
      if (sender.tab.id === tab?.id) resolveReady();
      return false;
    };
    const onRemoved = id => { if (id === tab?.id) rejectReady({ code: 'NETWORK' }); };
    runtime.onMessage.addListener(onReady);
    tabs.onRemoved.addListener(onRemoved);
    try {
      tab = await tabs.create({ url: LOOKUP_PAGE, active: false });
      await updateTabs(ids => [...new Set([...ids, tab.id])]);
      if (seen.has(tab.id)) resolveReady();
      await ready;
      clearTimeout(timer);
      const fetchImpl = async (url, init) => {
        const response = await tabs.sendMessage(tab.id, { type: 'vne:fetch', url, init: { method: init.method, headers: init.headers, body: init.body }, timeoutMs });
        if (response?.transportError) throw { code: response.transportError };
        if (!response || !Number.isInteger(response.status) || typeof response.body !== 'string') throw { code: 'INVALID_RESPONSE' };
        return new Response(response.body, { status: response.status, headers: { 'Content-Type': response.contentType ?? 'text/plain' } });
      };
      return await createVneSource({ fetchImpl, timeoutMs, clock }).lookup(vehicle);
    } catch (failure) {
      const error = diagnostic({ code: failure?.code ?? 'NETWORK', step: 'config', at: clock(), durationMs: clock() - start });
      return { kind: 'error', message: ERROR_MESSAGES[error.code], error };
    } finally {
      clearTimeout(timer);
      runtime.onMessage.removeListener(onReady);
      tabs.onRemoved.removeListener(onRemoved);
      if (Number.isInteger(tab?.id)) {
        try { if ((await tabs.get(tab.id)).url === LOOKUP_PAGE) await tabs.remove(tab.id); } catch { /* User may have closed the tab first. */ }
        await updateTabs(ids => ids.filter(id => id !== tab.id));
      }
    }
  }
  return Object.freeze({ lookup, cleanup });
}
