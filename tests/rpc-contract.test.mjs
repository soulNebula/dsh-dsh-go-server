import test from 'node:test'
import assert from 'node:assert/strict'

import { AppError } from '../src/host/errors.js'
import { createRpcHandler } from '../src/host/rpc.js'

const handler = createRpcHandler({
  'demo/echo': payload => ({ echo: payload?.value ?? null }),
  'demo/user-error': () => { throw new AppError('boom', 'Something the user can fix') },
  'demo/internal': () => { throw new Error('secret internals') },
})

test('wraps a value in the ok envelope', async () => {
  assert.deepEqual(await handler('demo/echo', { value: 7 }), { ok: true, value: { echo: 7 } })
})

test('unknown endpoints are refused', async () => {
  const result = await handler('demo/missing', {})
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'app/unknown-endpoint')
})

test('AppError keeps its code and message', async () => {
  const result = await handler('demo/user-error', {})
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'app/boom')
  assert.equal(result.error.message, 'Something the user can fix')
})

test('unknown errors are hidden', async () => {
  const result = await handler('demo/internal', {})
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'app/failed')
  assert.equal(result.error.message, 'Request failed')
})

test('non-owner peers are refused', async () => {
  const result = await handler('demo/echo', {}, undefined, { principal: 'guest' })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'app/forbidden')
})

test('the owner peer shapes of both DSH generations are accepted', async () => {
  assert.deepEqual(
    await handler('demo/echo', { value: 1 }, undefined, { principal: { kind: 'owner' } }),
    { ok: true, value: { echo: 1 } },
  )
  assert.deepEqual(
    await handler('demo/echo', { value: 2 }, undefined, { principal: 'owner' }),
    { ok: true, value: { echo: 2 } },
  )
  assert.deepEqual(
    await handler('demo/echo', { value: 3 }, undefined, { kind: 'owner' }),
    { ok: true, value: { echo: 3 } },
  )
})
