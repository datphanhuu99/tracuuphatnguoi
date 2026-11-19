import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PipeClient } from './cdp.mjs';

const root = resolve(import.meta.dirname, '..');
const PAGE = 'https://vnetraffic.org/tra-cuu-phat-nguoi-vnetraffic/';
const profile = await mkdtemp(join(tmpdir(), 'vne-diagnose-'));
const child = spawn('/usr/bin/google-chrome', ['--headless=new', '--remote-debugging-pipe', '--enable-unsafe-extension-debugging', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--user-data-dir='+profile, 'about:blank'], {stdio:['ignore','ignore','pipe','pipe','pipe']});
const client = new PipeClient(child, 60000);
const report = {at: new Date().toISOString(), extension: null, website: null};
async function evaluate(sessionId, expression) {
  const r = await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);
  if(r.exceptionDetails) throw Error(r.exceptionDetails.text);
  return r.result.value;
}
async function open(url) {
  const {targetId}=await client.send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
  await client.send('Runtime.enable',{},sessionId);
  await client.send('Page.enable',{},sessionId);
  await client.send('Page.navigate',{url},sessionId);
  const deadline=Date.now()+30000;
  while(Date.now()<deadline) {
    if(await evaluate(sessionId,'document.readyState !== "loading" && location.href !== "about:blank"')) return sessionId;
    await new Promise(r=>setTimeout(r,100));
  }
  throw Error('page load timeout');
}
// Only classifications and public response fields may leave the browser.
const summarize = `async response => {
  const text = await response.clone().text();
  let data; try {data=JSON.parse(text)} catch {}
  return {
    httpStatus:response.status, contentType:response.headers.get('content-type'),
    code:/^(?:rest_|vne_)[a-z_]{1,60}$/.test(data?.code ?? '') ? data.code : null,
    jsonKeys:data && typeof data==='object' ? Object.keys(data).filter(k=>!/nonce|cookie|token|auth/i.test(k)) : [],
    nonceMention:/nonce/i.test(text), originMention:/origin|referer/i.test(text),
    challenge:/Just a moment|cf-chl|challenge-platform/i.test(text),
    status:['found','not_found','invalid','rate_limited','unavailable'].includes(data?.status) ? data.status : null,
    plateMatches:data?.plate==='51K999999', typeMatches:data?.type==='motorbike',
    dataAsOf:/^\\d{4}-\\d{2}-\\d{2}$/.test(data?.data_as_of ?? '') ? data.data_as_of : null
  };
}`;
try {
  await client.send('Browser.getVersion');
  const {id}=await client.send('Extensions.loadUnpacked',{path:root});
  const extension=await open('chrome-extension://'+id+'/src/app.html');
  report.extension=await evaluate(extension,`(async()=>{
    const responses=[]; const summarize=${summarize};
    const {createVneSource}=await import('./source.js');
    const source=createVneSource({fetchImpl:async(...args)=>{
      const r=await fetch(...args); responses.push({step:args[0].includes('wp-json')?'lookup':'config',...await summarize(r)}); return r;
    }});
    const start=performance.now();
    const outcome=await source.lookup({plate:'51K999999',type:'motorcycle'});
    return {kind:outcome.kind,error:outcome.error??null,durationMs:Math.round(performance.now()-start),responses};
  })()`);
  const website=await open(PAGE);
  report.website=await evaluate(website,`(async()=>{
    const summarize=${summarize};
    const scripts=[...document.scripts].map(s=>s.textContent).join('\\n');
    const literal=scripts.match(/var VNE\\s*=\\s*(\\{[^;]+\\})/);
    if(!literal) return {step:'config',error:'NO_JSON_CONFIG'};
    const config=JSON.parse(literal[1]);
    const start=performance.now();
    try {
      const r=await fetch('https://vnetraffic.org/wp-json/vne/v1/lookup',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json','X-WP-Nonce':config.nonce},body:JSON.stringify({plate:'51K999999',type:'motorbike'}),signal:AbortSignal.timeout(25000)});
      return {durationMs:Math.round(performance.now()-start),...await summarize(r)};
    } catch {return {error:'FETCH_FAILED',durationMs:Math.round(performance.now()-start)}}
  })()`);
} catch(error) {report.error=error.message;}
finally {
  child.kill('SIGTERM');
  await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,2000))]);
  if(child.exitCode===null && !child.signalCode) child.kill('SIGKILL');
  client.dispose();
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  await writeFile(join(root,'artifacts/vne-diagnosis.json'),JSON.stringify(report,null,2)+'\n');
  console.info(JSON.stringify(report,null,2));
}
