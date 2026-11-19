import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { PipeClient } from '../scripts/cdp.mjs';

function fixture() {
  const process = new EventEmitter();
  process.stdio = [null, null, null, new PassThrough(), new PassThrough()];
  process.stderr = new PassThrough();
  return { process, client: new PipeClient(process, 50) };
}

test('CDP sends null-delimited requests and handles split replies', async () => {
  const { process, client } = fixture();
  let sent = '';
  process.stdio[3].on('data', chunk => { sent += chunk; });
  const pending = client.send('Runtime.evaluate', { expression: '1+1' }, 'page');
  const message = JSON.parse(sent.slice(0, -1));
  assert.equal(sent.at(-1), '\0');
  assert.equal(message.sessionId, 'page');
  assert.equal(message.method, 'Runtime.evaluate');
  process.stdio[4].write('{"id":1,"res');
  process.stdio[4].write('ult":{"value":2}}\0');
  assert.deepEqual(await pending, { value: 2 });
  client.dispose();
});

test('protocol errors reject, batched event messages are emitted', async () => {
  const { process, client } = fixture();
  const event = new Promise(resolve => client.once('event', resolve));
  const request = client.send('Missing.method');
  process.stdio[4].write('{"method":"Runtime.exceptionThrown","params":{}}\0{"id":1,"error":{"message":"unknown method"}}\0');
  assert.equal((await event).method, 'Runtime.exceptionThrown');
  await assert.rejects(request, /unknown method/);
  client.dispose();
});

test('CDP preserves Vietnamese UTF-8 split across transport chunks', async () => {
  const { process, client } = fixture();
  const pending = client.send('Runtime.evaluate');
  const encoded = Buffer.from('{"id":1,"result":{"text":"ộ"}}\0');
  const boundary = encoded.indexOf(Buffer.from('ộ')) + 1;
  process.stdio[4].write(encoded.subarray(0, boundary));
  process.stdio[4].write(encoded.subarray(boundary));
  assert.deepEqual(await pending, { text: 'ộ' });
  client.dispose();
});

test('browser crash rejects pending commands with bounded diagnostic stderr', async () => {
  const { process, client } = fixture();
  const pending = client.send('Browser.getVersion');
  process.stderr.write('Operation not permitted');
  process.emit('exit', null, 'SIGTRAP');
  await assert.rejects(pending, /SIGTRAP.*Operation not permitted/s);
  await assert.rejects(client.send('Browser.getVersion'), /exited/);
  client.dispose();
});

test('missing response times out and process error rejects pending requests', async () => {
  const { process, client } = fixture();
  await assert.rejects(client.send('Never.responds'), /timed out/);
  const pending = client.send('Browser.getVersion');
  process.emit('error', new Error('ENOENT'));
  await assert.rejects(pending, /ENOENT/);
  client.dispose();
});

test('disposing rejects pending commands and malformed data fails clearly', async () => {
  const a = fixture();
  const pending = a.client.send('Browser.getVersion');
  a.client.dispose();
  await assert.rejects(pending, /closed/);
  const b = fixture();
  const broken = b.client.send('Browser.getVersion');
  b.process.stdio[4].write('not JSON\0');
  await assert.rejects(broken, /Invalid CDP/);
  b.client.dispose();
});
