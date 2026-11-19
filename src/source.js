import { normalizePlate, resultFingerprint } from './domain.js';
import { diagnostic, ERROR_MESSAGES } from './errors.js';

export const OFFICIAL_URL = 'https://csgt.bocongan.gov.vn/tra-cuu-phat-nguoi';
export const LOOKUP_PAGE = 'https://vnetraffic.org/tra-cuu-phat-nguoi-vnetraffic/';
const API_URL = 'https://vnetraffic.org/wp-json/vne/v1/lookup';
const TYPES = Object.freeze({ car: 'car', motorcycle: 'motorbike', electric: 'electricbike' });
function fail(code, httpStatus) { throw { code, httpStatus }; }

/** Parse JSON literals only; never execute downloaded JavaScript. */
function readNonce(html) {
  const literals = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)]
    .flatMap(match => [...match[1].matchAll(/(?:var|let|const)\s+VNE\s*=\s*(\{[^;]*?\})\s*;/g)]);
  for (const match of literals) {
    try {
      const config = JSON.parse(match[1]);
      if (typeof config.nonce === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(config.nonce)) return config.nonce;
    } catch { /* Non-JSON configuration cannot be executed. */ }
  }
  fail('NONCE_CONFIG');
}
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
async function recordWithId(record, plate, type) {
  if (!record || typeof record !== 'object' || Array.isArray(record) || !Object.keys(record).length) fail('INVALID_RESPONSE');
  if (typeof record.loi_vi_pham !== 'string' || !record.loi_vi_pham.trim()) fail('INVALID_RESPONSE');
  if (record.bien_so != null && normalizePlate(record.bien_so) !== plate) fail('INVALID_RESPONSE');
  const keys = ['bien_so', 'thoi_gian', 'dia_diem', 'loi_vi_pham', 'don_vi_phat_hien'];
  const identity = Object.fromEntries(keys.filter(key => record[key] != null).map(key => [key, key === 'bien_so' ? plate : record[key]]));
  const basis = record.id != null ? { sourceId: record.id } : Object.keys(identity).some(key => key !== 'bien_so') ? identity : record;
  const bytes = new TextEncoder().encode(resultFingerprint([{ plate, type, ...basis }]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const id = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  return { ...record, id: `vne-${id}` };
}
async function normalizeResponse(body, plate, type) {
  if (body?.status === 'rate_limited') fail('RATE_LIMITED');
  if (body?.status === 'unavailable') fail('SERVER');
  try {
    if (normalizePlate(body?.plate) !== plate || body.type !== type || !validDate(body.data_as_of) || !Array.isArray(body.violations)) fail('INVALID_RESPONSE');
    if (body.status === 'not_found' && body.violations.length === 0) return { kind: 'success', records: [], source: 'VNeTraffic.org', dataAsOf: body.data_as_of };
    if (body.status !== 'found' || !body.violations.length) fail('INVALID_RESPONSE');
    return { kind: 'success', records: await Promise.all(body.violations.map(record => recordWithId(record, plate, type))), source: 'VNeTraffic.org', dataAsOf: body.data_as_of };
  } catch { fail('INVALID_RESPONSE'); }
}

/** Each request, including reading its body, has a finite deadline. No retries. */
export function createVneSource({ fetchImpl = (...args) => fetch(...args), timeoutMs = 25000, clock = Date.now } = {}) {
  async function request(url, init, json) {
    const abort = new AbortController();
    let timer;
    let status;
    try {
      return await Promise.race([
        (async () => {
          const response = await fetchImpl(url, { ...init, signal: abort.signal, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' });
          status = response.status;
          if (!response.ok) {
            let code = status === 429 ? 'RATE_LIMITED' : status >= 500 ? 'SERVER' : 'HTTP';
            if (status === 401 || status === 403) {
              try { if ((await response.json())?.code === 'rest_cookie_invalid_nonce') code = 'NONCE_INVALID'; } catch { /* Body never enters diagnostics. */ }
            }
            fail(code, status);
          }
          try { return { body: json ? await response.json() : await response.text(), status }; }
          catch { fail('INVALID_RESPONSE', status); }
        })(),
        new Promise((resolve, reject) => { timer = setTimeout(() => { reject({ code: 'TIMEOUT', httpStatus: status }); abort.abort(); }, timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
  }
  return Object.freeze({
    async lookup(vehicle) {
      const start = clock();
      let step = 'config';
      let httpStatus;
      try {
        const plate = normalizePlate(vehicle.plate);
        const type = TYPES[vehicle.type];
        if (!type) fail('INVALID_RESPONSE');
        const page = await request(LOOKUP_PAGE, {}, false);
        httpStatus = page.status;
        const nonce = readNonce(page.body);
        step = 'lookup';
        httpStatus = undefined;
        const response = await request(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce }, body: JSON.stringify({ plate, type }) }, true);
        httpStatus = response.status;
        return await normalizeResponse(response.body, plate, type);
      } catch (error) {
        const info = diagnostic({ code: error?.code ?? 'NETWORK', step, httpStatus: error?.httpStatus ?? httpStatus, at: clock(), durationMs: clock() - start });
        return { kind: 'error', message: ERROR_MESSAGES[info.code], error: info };
      }
    },
  });
}
export const officialSource = createVneSource();
