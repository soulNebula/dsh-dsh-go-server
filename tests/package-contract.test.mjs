import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

test('package.json declares the DSH bundle, client and exports', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.type, 'module')
  assert.match(pkg.main, /lib\/index\.js$/u)
  for (const key of ['.', './agent', './client', './cordis.patch.yml']) assert.ok(pkg.exports?.[key], `exports.${key}`)
  assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.ok(Array.isArray(pkg.dsh?.client?.inject))
})

test('cordis patch mounts the host row, preset and agent tools', async () => {
  const yml = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
  assert.match(yml, /@deepseek-ai\/dsh-agent-preset/u)
  assert.match(yml, /\/agent['"]?\s*$/mu)
  assert.match(yml, /write:\s*false/u)
})
