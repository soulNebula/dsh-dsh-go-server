// Plugin preferences (non-secret).
//
// The account and password are NOT stored here: they belong to the Server's
// `apps/server/.env`, which the Server itself reads at start-up. This file only
// remembers where that installation lives on disk.
export const PREF_DEFAULTS = Object.freeze({ rootDir: '' })

const MAX_ROOT = 400

export function cleanPrefs(input = {}, base = PREF_DEFAULTS) {
  const next = { ...base }
  if (input.rootDir !== undefined) {
    const value = String(input.rootDir ?? '').trim().slice(0, MAX_ROOT)
    next.rootDir = value.replace(/[\\/]+$/u, '')
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
