import test from 'node:test'
import assert from 'node:assert/strict'

import {
  LIMITS,
  classifyService,
  normalizeDevice,
  normalizeDevices,
  normalizeEmail,
  normalizePassword,
  normalizePort,
  parseDotEnv,
  redactLine,
  setDotEnv,
  tailLines,
  text,
} from '../src/core/model.js'

test('text trims, strips control characters and caps the length', () => {
  assert.equal(text('  hello  '), 'hello')
  assert.equal(text('a\u0000b'), 'a b')
  assert.equal(text('x'.repeat(LIMITS.name + 20)).length, LIMITS.name)
  assert.equal(text(null), '')
})

test('email is trimmed and lowercased', () => {
  assert.equal(normalizeEmail('  Owner@Example.COM '), 'owner@example.com')
  assert.throws(() => normalizeEmail('not-an-email'), /邮箱/u)
  assert.throws(() => normalizeEmail(''), /邮箱/u)
})

test('password follows the server rule (12–128, no spaces)', () => {
  assert.equal(normalizePassword('correct-horse-battery'), 'correct-horse-battery')
  assert.throws(() => normalizePassword('short'), /12/u)
  assert.throws(() => normalizePassword('has space in it 123'), /空格/u)
  assert.throws(() => normalizePassword('a'.repeat(LIMITS.passwordMax + 1)), /太长/u)
})

test('port must be an integer in the unprivileged range', () => {
  assert.equal(normalizePort('8080'), 8080)
  assert.throws(() => normalizePort('80'), /1024/u)
  assert.throws(() => normalizePort('abc'), /端口/u)
  assert.throws(() => normalizePort(70000), /端口/u)
})

test('parseDotEnv reads keys and ignores comments', () => {
  const parsed = parseDotEnv('# note\nDSH_SERVER_PORT=8080\nDSH_SERVER_ACCOUNT="me@x.dev"\n\nBROKEN-LINE\n')
  assert.equal(parsed.DSH_SERVER_PORT, '8080')
  assert.equal(parsed.DSH_SERVER_ACCOUNT, 'me@x.dev')
  assert.equal(Object.keys(parsed).length, 2)
})

test('setDotEnv updates in place, keeps comments and appends new keys', () => {
  const before = '# account\nDSH_SERVER_ACCOUNT=old@x.dev\nDSH_SERVER_PORT=8080\n'
  const after = setDotEnv(before, { DSH_SERVER_ACCOUNT: 'new@x.dev', DSH_SERVER_PASSWORD: 'correct-horse-battery' })
  assert.match(after, /# account/u)
  assert.match(after, /DSH_SERVER_ACCOUNT=new@x\.dev/u)
  assert.match(after, /DSH_SERVER_PORT=8080/u)
  assert.match(after, /DSH_SERVER_PASSWORD=correct-horse-battery/u)
  assert.ok(after.endsWith('\n'))
  assert.equal(after.split('\n').filter(Boolean).length, 4)
})

test('setDotEnv never rewrites unrelated lines', () => {
  const before = 'DSH_SERVER_HOST=0.0.0.0\nDSH_SERVER_LOG_LEVEL=info\n'
  assert.equal(setDotEnv(before, {}), before)
  assert.equal(setDotEnv(before, { DSH_SERVER_LOG_LEVEL: 'debug' }), 'DSH_SERVER_HOST=0.0.0.0\nDSH_SERVER_LOG_LEVEL=debug\n')
})

test('classifyService separates listening from healthy', () => {
  assert.equal(classifyService({ listening: false, healthy: false }), 'stopped')
  assert.equal(classifyService({ listening: true, healthy: false }), 'degraded')
  assert.equal(classifyService({ listening: true, healthy: true }), 'running')
})

test('redactLine hides launch tokens and passwords', () => {
  const line = 'dsh web: http://127.0.0.1:8080/?token=abc123 & password=supersecret DSH_SERVER_PASSWORD=hunter2'
  const redacted = redactLine(line)
  assert.ok(!redacted.includes('abc123'))
  assert.ok(!redacted.includes('hunter2'))
  assert.match(redacted, /token=\*\*\*/u)
})

test('tailLines keeps the last N non-empty lines', () => {
  const lines = tailLines('a\nb\nc\n\n', 2)
  assert.deepEqual(lines, ['b', 'c'])
  assert.equal(tailLines('a\nb\nc', 100).length, 3)
  assert.deepEqual(tailLines('', 5), [])
})

test('normalizeDevice drops identity keys and unknown roles', () => {
  const device = normalizeDevice({
    deviceId: 'dev-abcdef',
    name: 'My phone',
    role: 'client',
    online: true,
    identityKey: 'secret-material',
    lastSeenAt: 123,
  })
  assert.deepEqual(device, {
    deviceId: 'dev-abcdef',
    name: 'My phone',
    platform: '',
    role: 'client',
    online: true,
    lastSeenAt: 123,
  })
  assert.equal(JSON.stringify(device).includes('secret-material'), false)
  assert.equal(normalizeDevice({ name: 'no id' }), null)
})

test('normalizeDevices tolerates a malformed payload', () => {
  assert.deepEqual(normalizeDevices(null), [])
  assert.deepEqual(normalizeDevices({ items: 'nope' }), [])
  const items = normalizeDevices({ items: [{ deviceId: 'a-b' }, { deviceId: '' }] })
  assert.equal(items.length, 1)
  assert.equal(items[0].role, 'client')
})
