import { EventEmitter } from 'node:events';
import { StringDecoder } from 'node:string_decoder';

/** Null-delimited Chrome DevTools transport over child-process fd 3/4. */
export class PipeClient extends EventEmitter {
  constructor(process, timeoutMs = 15000) {
    super();
    this.process = process;
    this.timeoutMs = timeoutMs;
    this.pending = new Map();
    this.nextId = 0;
    this.buffer = '';
    this.decoder = new StringDecoder('utf8');
    this.stderr = '';
    this.closed = null;
    this.onData = chunk => this.receive(chunk);
    this.onStderr = chunk => { this.stderr = (this.stderr + chunk).slice(-6000); };
    this.onError = error => this.fail(error);
    this.onExit = (code, signal) => this.fail(new Error(`Chrome exited (${signal ?? code}): ${this.stderr}`));
    this.onClose = () => this.fail(new Error(`Chrome CDP pipe closed: ${this.stderr}`));
    process.stdio[4].on('data', this.onData);
    process.stdio[4].on('end', this.onClose);
    process.stdio[3].on('error', this.onError);
    process.stderr.on('data', this.onStderr);
    process.on('error', this.onError);
    process.on('exit', this.onExit);
  }

  send(method, params = {}, sessionId) {
    if (this.closed) return Promise.reject(this.closed);
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out: ${this.stderr}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.process.stdio[3].write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
    });
  }

  receive(chunk) {
    this.buffer += this.decoder.write(chunk);
    let boundary;
    while ((boundary = this.buffer.indexOf('\0')) >= 0) {
      const raw = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 1);
      let message;
      try { message = JSON.parse(raw); }
      catch { this.fail(new Error('Invalid CDP JSON response')); return; }
      if (!message.id) { this.emit('event', message); continue; }
      const request = this.pending.get(message.id);
      if (!request) continue;
      this.pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result ?? {});
    }
  }

  fail(error) {
    this.closed = error;
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.pending.clear();
  }

  dispose() {
    this.fail(new Error('CDP client closed'));
    this.process.stdio[4].off('data', this.onData);
    this.process.stdio[4].off('end', this.onClose);
    this.process.stderr.off('data', this.onStderr);
    // Keep error handlers installed until pipes close to avoid unhandled EPIPE.
    this.removeAllListeners();
  }
}
