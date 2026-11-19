/** Packaged isolated-world content script. No page JavaScript/config is executed. */
(() => {
  const PAGE = 'https://vnetraffic.org/tra-cuu-phat-nguoi-vnetraffic/';
  const API = 'https://vnetraffic.org/wp-json/vne/v1/lookup';
  let posted = false;
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message?.type !== 'vne:fetch' || ![PAGE, API].includes(message.url)) return false;
    if (message.url === PAGE) {
      const scripts = [...document.querySelectorAll('script')].filter(node => /\b(?:var|let|const)\s+VNE\s*=/.test(node.textContent));
      respond({ status: 200, contentType: 'text/html', body: scripts.map(node => `<script>${node.textContent}</script>`).join('\n') });
      return false;
    }
    let payload;
    try { payload = JSON.parse(message.init?.body); } catch { return false; }
    if (posted || message.init?.method !== 'POST' || !/^\d{2}[A-Z]{1,2}\d{4,6}$/.test(payload?.plate ?? '') || !['car', 'motorbike', 'electricbike'].includes(payload?.type) || typeof message.init?.headers?.['X-WP-Nonce'] !== 'string') return false;
    posted = true;
    const timeoutMs = Number.isFinite(message.timeoutMs) ? Math.min(25000, Math.max(1, message.timeoutMs)) : 25000;
    fetch(API, {
      method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error',
      referrerPolicy: 'strict-origin-when-cross-origin', signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': message.init.headers['X-WP-Nonce'] },
      body: JSON.stringify({ plate: payload.plate, type: payload.type }),
    }).then(async response => respond({ status: response.status, contentType: response.headers.get('Content-Type'), body: await response.text() }))
      .catch(error => respond({ transportError: ['TimeoutError', 'AbortError'].includes(error?.name) ? 'TIMEOUT' : 'NETWORK' }));
    return true;
  });
  chrome.runtime.sendMessage({ type: 'vne:ready' }).catch(() => {});
})();
