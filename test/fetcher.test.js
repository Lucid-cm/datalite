import test from 'node:test';
import assert from 'node:assert/strict';
import { readBody, decodeBody } from '../server/fetcher.js';

test('readBody returns the whole body under the cap', async () => {
  const buf = await readBody(new Response('a'.repeat(50)), 100);
  assert.equal(buf.length, 50);
});

test('readBody rejects bodies over the cap', async () => {
  await assert.rejects(() => readBody(new Response('a'.repeat(200)), 100), { code: 'too_large' });
});

test('readBody with truncate keeps only the first maxBytes', async () => {
  const buf = await readBody(new Response('b'.repeat(200)), 100, { truncate: true });
  assert.equal(buf.length, 100);
  assert.equal(buf.toString(), 'b'.repeat(100));
});

test('readBody with truncate ignores a large declared content-length', async () => {
  const res = new Response('c'.repeat(200), { headers: { 'content-length': '999999' } });
  const buf = await readBody(res, 100, { truncate: true });
  assert.equal(buf.length, 100);
});

test('readBody without truncate rejects on declared size before reading', async () => {
  const res = new Response('d', { headers: { 'content-length': '999999' } });
  await assert.rejects(() => readBody(res, 100), { code: 'too_large' });
});

test('decodeBody honours charset and falls back safely', () => {
  assert.equal(decodeBody(Buffer.from('hello'), 'text/html; charset=utf-8'), 'hello');
  assert.equal(decodeBody(Buffer.from('hello'), 'text/html; charset=not-a-real-charset'), 'hello');
});
