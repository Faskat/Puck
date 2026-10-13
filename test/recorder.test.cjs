const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

function fixture({ constructorFails = false, startFails = false, stopAsync = false } = {}) {
  const requests = [], recordings = [];
  class FakeRecorder {
    state = 'inactive';
    constructor(stream) {
      if (constructorFails) throw new Error('unsupported format');
      this.stream = stream;
      recordings.push(this);
    }
    start() {
      if (startFails) throw new Error('cannot start');
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      if (!stopAsync) {
        this.ondataavailable?.({ data: new Blob(['audio']) });
        this.onstop?.();
      }
    }
  }
  const sandbox = { module: { exports: {} }, Blob, MediaRecorder: FakeRecorder,
    navigator: { mediaDevices: { getUserMedia() {
      return new Promise((resolve, reject) => requests.push({ resolve, reject }));
    } } } };
  const source = transformSync(fs.readFileSync('src/recorder.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  vm.runInNewContext(source, sandbox);
  return { recorder: new sandbox.module.exports.AudioRecorder(), requests, recordings };
}

function stream() {
  const track = { stopped: 0, stop() { this.stopped++; } };
  return { track, getTracks() { return [track]; } };
}

test('concurrent starts share one permission request and stream', async () => {
  const f = fixture(), s = stream();
  const first = f.recorder.start(), second = f.recorder.start();
  assert.equal(first, second);
  assert.equal(f.requests.length, 1);
  f.requests[0].resolve(s);
  assert.equal(await first, true);
  assert.equal(f.recordings.length, 1);
  assert.equal(f.recorder.isStarting, false);
  f.recorder.cancel();
  assert.equal(s.track.stopped, 1);
});

test('cancel while permission is pending releases the late stream', async () => {
  const f = fixture(), s = stream();
  const pending = f.recorder.start();
  f.recorder.cancel();
  f.requests[0].resolve(s);
  assert.equal(await pending, false);
  assert.equal(s.track.stopped, 1);
  assert.equal(f.recordings.length, 0);
  assert.equal(f.recorder.isRecording, false);
});

test('a stale permission result cannot overwrite a newer recording', async () => {
  const f = fixture(), old = stream(), current = stream();
  const stale = f.recorder.start();
  f.recorder.cancel();
  const fresh = f.recorder.start();
  f.requests[1].resolve(current);
  assert.equal(await fresh, true);
  f.requests[0].resolve(old);
  assert.equal(await stale, false);
  assert.equal(old.track.stopped, 1);
  assert.equal(current.track.stopped, 0);
  assert.equal(f.recorder.isRecording, true);
  f.recorder.cancel();
});

for (const option of ['constructorFails', 'startFails']) {
  test(`${option} releases the acquired stream`, async () => {
    const f = fixture({ [option]: true }), s = stream();
    const pending = f.recorder.start();
    f.requests[0].resolve(s);
    await assert.rejects(pending);
    assert.equal(s.track.stopped, 1);
    assert.equal(f.recorder.isStarting, false);
    assert.equal(f.recorder.isRecording, false);
  });
}

test('permission rejection permits a later start', async () => {
  const f = fixture();
  const denied = f.recorder.start();
  f.requests[0].reject(new Error('denied'));
  await assert.rejects(denied);
  const retry = f.recorder.start(), s = stream();
  f.requests[1].resolve(s);
  assert.equal(await retry, true);
  f.recorder.cancel();
});

test('stop returns audio and releases the microphone', async () => {
  const f = fixture(), s = stream(), pending = f.recorder.start();
  f.requests[0].resolve(s);
  await pending;
  assert.equal(await (await f.recorder.stop()).text(), 'audio');
  assert.equal(s.track.stopped, 1);
  assert.equal(f.recorder.isRecording, false);
});

test('cancel during stop rejects rather than leaving the caller pending', async () => {
  const f = fixture({ stopAsync: true }), s = stream(), pending = f.recorder.start();
  f.requests[0].resolve(s);
  await pending;
  const stopping = f.recorder.stop();
  f.recorder.cancel();
  await assert.rejects(stopping);
  assert.equal(s.track.stopped, 1);
});
