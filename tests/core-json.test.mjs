import test from 'node:test'
import assert from 'node:assert/strict'

import { extractJson } from '../src/core/json.js'

test('extracts JSON from a fenced block', () => {
  assert.deepEqual(extractJson('Sure:\n```json\n{"a":1}\n```\nDone.'), { a: 1 })
})

test('extracts JSON surrounded by prose', () => {
  assert.deepEqual(extractJson('here you go {"a":[1,2]} thanks'), { a: [1, 2] })
})

test('repairs trailing commas', () => {
  assert.deepEqual(extractJson('{"a":1,}'), { a: 1 })
})

test('repairs a truncated tail at the last complete member', () => {
  const value = extractJson('{"title":"x","points":[{"title":"a","detail":"b"')
  assert.equal(value.title, 'x')
  assert.equal(value.points[0].title, 'a')
})

