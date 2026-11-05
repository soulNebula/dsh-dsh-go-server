// JSON storage under $DSH_HOME/<data-dir>.
// Paths are built from ids only; writes are atomic and serialized per file.
import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { assertId } from '../core/ids.js'

const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY'])
const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms) })

export function resolveDshHome(env = process.env) {
  return typeof env.DSH_HOME === 'string' && env.DSH_HOME.trim() !== '' ? env.DSH_HOME : join(homedir(), '.dsh')
}

async function renameWithRetry(from, to, attempts = 8) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      if (!RETRYABLE.has(error?.code) || attempt >= attempts) throw error
      await sleep(15 * 2 ** attempt)
    }
  }
}

export async function writeFileAtomic(path, data) {
  const temp = `${path}.${process.pid}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.tmp`
  await writeFile(temp, data)
  try {
    await renameWithRetry(temp, path)
  } catch (error) {
    await unlink(temp).catch(() => undefined)
    throw error
  }
}

export function createStore({ root }) {
  if (typeof root !== 'string' || !root) throw new TypeError('store root is required')
  const queues = new Map()

  // Serialize writes to the same file. Reads see completed writes.
  const exclusive = (path, task) => {
    const previous = queues.get(path) ?? Promise.resolve()
    const run = previous.catch(() => undefined).then(task)
    const tail = run.catch(() => undefined)
    queues.set(path, tail)
    tail.then(() => { if (queues.get(path) === tail) queues.delete(path) })
    return run
  }

  const paths = {
    root,
    records: () => join(root, 'records'),
    record: id => join(root, 'records', `${assertId(id, 'rec')}.json`),
    prefs: () => join(root, 'prefs.json'),
  }

  async function readJson(path, fallback = null) {
    try {
      return JSON.parse(await readFile(path, 'utf8'))
    } catch (error) {
      if (error?.code === 'ENOENT') return fallback
      if (error instanceof SyntaxError) return fallback
      throw error
    }
  }

  function writeJson(path, value) {
    return exclusive(path, async () => {
      await mkdir(join(path, '..'), { recursive: true })
      await writeFileAtomic(path, `${JSON.stringify(value, null, 1)}\n`)
      return value
    })
  }

  function updateJson(path, fallback, mutate) {
    return exclusive(path, async () => {
      const current = await readJson(path, fallback)
      const next = (await mutate(current)) ?? current
      await mkdir(join(path, '..'), { recursive: true })
      await writeFileAtomic(path, `${JSON.stringify(next, null, 1)}\n`)
      return next
    })
  }

  async function listIds(dir, prefix) {
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      return entries
        .map(entry => entry.name.replace(/\.json$/u, ''))
        .filter(name => new RegExp(`^${prefix}_[a-z0-9]{6,40}$`, 'u').test(name))
    } catch (error) {
      if (error?.code === 'ENOENT') return []
      throw error
    }
  }

  async function exists(path) {
    try { await stat(path); return true } catch { return false }
  }

  return Object.freeze({ paths, readJson, writeJson, updateJson, listIds, exists, removeDir: path => rm(path, { recursive: true, force: true }) })
}
