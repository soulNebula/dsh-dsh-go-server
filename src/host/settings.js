// Plugin preferences and credentials.
// Preferences are non-secret and may reach the browser; secrets only live in
// DSH's credential store and are never returned.
import { AppError } from './errors.js'

export const PREF_DEFAULTS = Object.freeze({
  teachProvider: '',
  teachModel: '',
  quickProvider: '',
  quickModel: '',
})

const ROUTE = /^[\w.:@/-]{0,200}$/u

export function cleanPrefs(input = {}, base = PREF_DEFAULTS) {
  const next = { ...base }
  for (const key of ['teachProvider', 'teachModel', 'quickProvider', 'quickModel']) {
    if (input[key] !== undefined) next[key] = ROUTE.test(String(input[key])) ? String(input[key]) : base[key]
  }
  return next
}

export function createPrefs(store) {
  let cache = { ...PREF_DEFAULTS }
  return {
    async load() {
      cache = cleanPrefs((await store.readJson(store.paths.prefs(), null)) ?? {}, PREF_DEFAULTS)
      return cache
    },
    read: () => cache,
    async save(patch) {
      cache = cleanPrefs(patch, cache)
      await store.writeJson(store.paths.prefs(), cache)
      return cache
    },
  }
}

// `credentialKey` comes from @deepseek-ai/dsh-credentials (injected by index.js).
export function createKeyStore({ getCredentials, credentialKey }) {
  const keyOf = () => credentialKey('dsh-remote-server', 'service-key')
  const service = () => {
    const credentials = getCredentials()
    if (!credentials) throw new AppError('no-credentials', 'DSH credentials are not available in this profile.')
    return credentials
  }
  return {
    async read() {
      const record = await service().readRecord(keyOf())
      return record?.kind === 'api-key' && typeof record.key === 'string' ? record.key : undefined
    },
    async status() {
      try {
        const info = await service().describeRecord(keyOf())
        return { configured: info?.configured === true }
      } catch {
        return { configured: false }
      }
    },
    async write(value) {
      const key = String(value ?? '').trim()
      if (!/^[\x21-\x7E]{8,1024}$/u.test(key)) throw new AppError('bad-key', 'The key looks wrong (8–1024 printable characters, no spaces).')
      await service().modifyRecord(keyOf(), async () => ({ kind: 'api-key', key }))
    },
    async remove() {
      await service().deleteRecord(keyOf())
    },
  }
}

export function createSettingsService({ prefs, keys, llmPort }) {
  return {
    async get() {
      const status = await keys.status().catch(() => ({ configured: false }))
      return {
        ...prefs.read(),
        keys: status,
        images: { teach: llmPort.supportsImages('teach'), quick: llmPort.supportsImages('quick') },
      }
    },
    async save(patch) {
      await prefs.save(patch ?? {})
      llmPort.refreshCapabilities().catch(() => undefined)
      return this.get()
    },
    async setKey({ key } = {}) {
      await keys.write(key)
      return this.get()
    },
    async clearKey() {
      await keys.remove()
      return this.get()
    },
  }
}
