import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIPv4, isPrivateIPv6, normalizeInput, assertPublicUrl } from '../server/ssrf.js';

test('private IPv4 ranges are blocked', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1']) {
    assert.equal(isPrivateIPv4(ip), true, ip);
  }
});

test('public IPv4 passes', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '151.101.1.69']) {
    assert.equal(isPrivateIPv4(ip), false, ip);
  }
});

test('private IPv6 forms are blocked', () => {
  for (const ip of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1', '::ffff:7f00:1', 'ff02::1']) {
    assert.equal(isPrivateIPv6(ip), true, ip);
  }
});

test('public IPv6 passes', () => {
  assert.equal(isPrivateIPv6('2606:4700:4700::1111'), false);
});

test('normalizeInput adds https only when no scheme', () => {
  assert.equal(normalizeInput('example.com/a'), 'https://example.com/a');
  assert.equal(normalizeInput('http://example.com'), 'http://example.com');
  assert.equal(normalizeInput('   '), '');
});

test('assertPublicUrl rejects dangerous targets without needing DNS', async () => {
  const bad = [
    'file:///etc/passwd',
    'ftp://example.com',
    'http://localhost/',
    'http://foo.localhost/',
    'http://127.0.0.1/',
    'http://2130706433/', // decimal form of 127.0.0.1
    'http://0x7f.0.0.1/',
    'http://[::1]/',
    'http://10.0.0.5/',
    'http://169.254.169.254/latest/meta-data',
    'http://user:pass@example.com/',
    'https://example.com:8080/',
    'not a url',
  ];
  for (const u of bad) {
    await assert.rejects(() => assertPublicUrl(u), u);
  }
});

test('assertPublicUrl accepts a public IP literal', async () => {
  const url = await assertPublicUrl('https://8.8.8.8/');
  assert.equal(url.hostname, '8.8.8.8');
});
