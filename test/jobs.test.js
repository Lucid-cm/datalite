import test from 'node:test';
import assert from 'node:assert/strict';
import { createJobStore, createCoalescer, waitFor } from '../server/jobs.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('job resolves and is retrievable by id', async () => {
  const store = createJobStore(1000);
  const job = store.start(async () => ({ bytes: 5 }));
  assert.equal(store.get(job.id), job);
  assert.deepEqual(await waitFor(job, 500), { bytes: 5 });
  assert.equal(job.done, true);
});

test('failed job yields null, not a throw', async () => {
  const store = createJobStore(1000);
  const job = store.start(async () => {
    throw new Error('boom');
  });
  assert.equal(await waitFor(job, 500), null);
});

test('slow job yields undefined while still running', async () => {
  const store = createJobStore(1000);
  const job = store.start(() => sleep(200).then(() => 'late'));
  assert.equal(await waitFor(job, 20), undefined);
  assert.equal(await waitFor(job, 500), 'late');
});

test('expired jobs disappear', async () => {
  const store = createJobStore(10);
  const job = store.start(async () => 1);
  await sleep(30);
  assert.equal(store.get(job.id), null);
  store.prune();
  assert.equal(store.size(), 0);
});

test('store evicts oldest beyond max', () => {
  const store = createJobStore(1000, 2);
  const a = store.start(async () => 1);
  store.start(async () => 2);
  store.start(async () => 3);
  assert.equal(store.get(a.id), null);
  assert.equal(store.size(), 2);
});

test('coalescer shares one run between concurrent callers', async () => {
  const coalesce = createCoalescer();
  let runs = 0;
  const work = async () => {
    runs += 1;
    await sleep(20);
    return 'done';
  };
  const [a, b] = await Promise.all([coalesce('k', work), coalesce('k', work)]);
  assert.equal(a, 'done');
  assert.equal(b, 'done');
  assert.equal(runs, 1);
  await coalesce('k', work);
  assert.equal(runs, 2); // finished work is not reused
});

test('coalescer lets a failure through and then recovers', async () => {
  const coalesce = createCoalescer();
  await assert.rejects(() => coalesce('x', async () => { throw new Error('nope'); }));
  assert.equal(await coalesce('x', async () => 'ok'), 'ok');
});
