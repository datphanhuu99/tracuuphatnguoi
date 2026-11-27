const account = '3a9cb098-6dc0-4d45-a253-afd6c082a7f9';
const item = 'gocbaghajloeejaiehnmbledmhomhpcb';
const base = `https://chrome.google.com/webstore/devconsole/${account}/${item}/edit`;
const rootUrl = `https://chrome.google.com/webstore/devconsole/${account}`;
const repoUrl = 'https://github.com/datphanhuu99/tracuuphatnguoi';
const policyUrl = `${repoUrl}/blob/main/store/PRIVACY.md`;

const purpose = 'Keep a local vehicle list and check reference traffic-fine results daily, with notifications when those results change.';
const reasons = [
  'Store vehicle list, daily attempt budget, results, settings, theme and diagnostics locally; session storage coordinates temporary source tabs. No sync.',
  'Wake the service worker to check whether a new local day needs an update. Not a guarantee of exact execution time.',
  "Display a system notification when a vehicle's violation results change. Controlled by the user's notification setting.",
  'Load the lookup page and use its same-origin lookup API. No access to unrelated hosts.',
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const targets = await fetch('http://127.0.0.1:9222/json').then(response => {
  if (!response.ok) throw new Error(`CDP target list failed: ${response.status}`);
  return response.json();
});
const target = targets.find(entry => entry.type === 'page' && entry.url.startsWith(`https://chrome.google.com/webstore/devconsole/${account}/`) && entry.webSocketDebuggerUrl);
if (!target) throw new Error(`No existing publisher dashboard tab for ${account}; no tabs were opened or closed.`);

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});
let nextId = 0;
const pending = new Map();
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const task = pending.get(message.id);
  if (!task) return;
  pending.delete(message.id);
  clearTimeout(task.timer);
  message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result ?? {});
});
function cdp(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'Page evaluation failed');
  return result.result?.value;
}
const jsString = value => JSON.stringify(value);
async function navigate(url) {
  await cdp('Page.navigate', { url });
  for (let attempt = 0; attempt < 40; attempt++) {
    await sleep(500);
    const state = await evaluate('({href:location.href,ready:document.readyState})');
    if (state.href === url && state.ready === 'complete') {
      await sleep(1200);
      return;
    }
  }
  throw new Error(`Page did not load: ${url}`);
}
async function waitForButton(text) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await evaluate(`[...document.querySelectorAll('button')].some(e=>e.innerText.trim().includes(${jsString(text)}))`)) return;
    await sleep(500);
  }
  throw new Error(`Dashboard did not render button: ${text}`);
}
async function clickAt(selector, description) {
  const box = await evaluate(`(() => { const e=document.querySelector(${jsString(selector)}); if(!e) return null; e.scrollIntoView({block:'center',inline:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height,disabled:e.disabled}; })()`);
  if (!box || box.w < 1 || box.h < 1 || box.disabled) throw new Error(`Cannot click ${description}`);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await sleep(350);
}
async function clickText(text, description = text) {
  const box = await evaluate(`(() => { const e=[...document.querySelectorAll('button')].find(x=>x.innerText.trim().includes(${jsString(text)})); if(!e) return null; e.scrollIntoView({block:'center',inline:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height,disabled:e.disabled}; })()`);
  if (!box || box.w < 1 || box.h < 1 || box.disabled) throw new Error(`Cannot click ${description}`);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await sleep(350);
}
async function fill(selector, value, description) {
  const box = await evaluate(`(() => { const e=document.querySelector(${jsString(selector)}); if(!e) return null; e.scrollIntoView({block:'center',inline:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height,value:e.value}; })()`);
  if (!box || box.w < 1 || box.h < 1) throw new Error(`Field not found: ${description}`);
  if (box.value === value) return;
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 });
  await cdp('Input.insertText', { text: value });
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab' });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab' });
  await sleep(300);
  const actual = await evaluate(`document.querySelector(${jsString(selector)})?.value`);
  if (actual !== value) throw new Error(`Typing was not registered in ${description}; expected value was not present.`);
}
async function clickCheckbox(label) {
  const box = await evaluate(`(() => { const e=[...document.querySelectorAll('input[type="checkbox"][aria-label]')].find(x=>x.getAttribute('aria-label').trim()===${jsString(label.trim())}); if(!e) return null; if(e.checked) return {checked:true}; e.scrollIntoView({block:'center',inline:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}; })()`);
  if (!box) throw new Error(`Checkbox not found: ${label}`);
  if (box.checked) return;
  if (box.w < 1 || box.h < 1) throw new Error(`Checkbox not visible: ${label}`);
  await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await sleep(200);
  if (!(await evaluate(`[...document.querySelectorAll('input[type="checkbox"][aria-label]')].find(x=>x.getAttribute('aria-label').trim()===${jsString(label.trim())})?.checked`))) throw new Error(`Checkbox click was not registered: ${label}`);
}
async function fillPrivacy() {
  await navigate(`${base}/privacy`);
  await waitForButton('Save draft');
  await fill('textarea', purpose, 'Single purpose description');
  const fields = JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('textarea')].map(e=>({id:e.id,label:document.getElementById(e.getAttribute('aria-labelledby'))?.innerText,value:e.value})))`));
  if (fields.length < 5) throw new Error('Privacy permission fields were not found.');
  for (let index = 0; index < 4; index++) await fill(`#${fields[index + 1].id}`, reasons[index], fields[index + 1].label ?? `Permission justification ${index + 1}`);
  await clickCheckbox('Personally identifiable information');
  for (const label of [
    'I do not sell or transfer user data to third parties, outside of the approved use cases',
    "I do not use or transfer user data for purposes that are unrelated to my item's single purpose",
    'I do not use or transfer user data to determine creditworthiness or for lending purposes',
  ]) await clickCheckbox(label);
  await fill('input[aria-labelledby="i38-label-id"]', policyUrl, 'Privacy policy URL');
  await clickText('Save draft');
  await sleep(1500);
  console.log('Privacy draft:', await evaluate(`JSON.stringify({purpose:document.querySelector('textarea')?.value,areas:[...document.querySelectorAll('textarea')].slice(1).map(e=>e.value),pii:document.querySelector('input[aria-label="Personally identifiable information"]')?.checked,certs:[...document.querySelectorAll('input[type="checkbox"][aria-label^="I do not"]')].map(e=>e.checked),policy:document.querySelector('input[aria-labelledby="i38-label-id"]')?.value})`));
}
async function fillListing() {
  await navigate(`${base}/listing`);
  await waitForButton('Save draft');
  const category = await evaluate(`document.body.innerText.includes('Category\\nCategory\\nCategory\\nTools')`);
  if (!category) throw new Error('Listing category is not Tools; refusing to change unrelated listing details.');
  await fill('input[placeholder="Homepage URL"]', repoUrl, 'Homepage URL');
  await fill('input[placeholder="Support URL"]', repoUrl, 'Support URL');
  await clickText('Save draft');
  await sleep(1500);
  console.log('Listing draft:', await evaluate(`JSON.stringify({category:document.body.innerText.includes('Category\\nCategory\\nCategory\\nTools'),homepage:document.querySelector('input[placeholder="Homepage URL"]')?.value,support:document.querySelector('input[placeholder="Support URL"]')?.value})`));
}
async function verifyContact() {
  await navigate(`${rootUrl}/settings`);
  await waitForButton('Verify email');
  const before = await evaluate('document.body.innerText');
  if (!before.includes('datphanhuu99@gmail.com') || !before.includes('Unverified')) throw new Error('Publisher contact is not the requested unverified email; refusing to modify other publisher settings.');
  await clickText('Verify email');
  await waitForButton('Verify email address');
  const selector = await evaluate(`(() => { const e=[...document.querySelectorAll('input[type="text"][aria-labelledby]')].find(x=>document.getElementById(x.getAttribute('aria-labelledby'))?.innerText.includes('Email address')); return e ? 'input[aria-labelledby='+JSON.stringify(e.getAttribute('aria-labelledby'))+']' : null; })()`);
  if (!selector) throw new Error('Email confirmation field was not found.');
  const modalEmail = await evaluate(`document.querySelector(${jsString(selector)})?.value`);
  if (modalEmail !== 'datphanhuu99@gmail.com') await fill(selector, 'datphanhuu99@gmail.com', 'Publisher contact email');
  await clickText('Verify email address');
  await sleep(1000);
  console.log('Email verification result:', (await evaluate('document.body.innerText')).slice(-1000));
}
async function finalBlockers() {
  await navigate(base);
  await waitForButton("Why can't I submit?");
  await clickText('Why can\'t I submit?');
  await sleep(500);
  console.log('FINAL_BLOCKERS', await evaluate(`JSON.stringify({url:location.href,text:document.body.innerText.slice(-5000)})`));
}

try {
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Page.bringToFront');
  const mode = process.argv[2] ?? 'apply';
  if (mode === 'apply') {
    await fillPrivacy();
    await fillListing();
    await verifyContact();
    await finalBlockers();
  } else if (mode === 'final') await finalBlockers();
  else throw new Error(`Unknown mode: ${mode}`);
} finally {
  ws.close();
}
