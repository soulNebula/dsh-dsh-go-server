// Host services are published here; the agent entry (a separate loader row)
// reads them. A global symbol keeps both entries sharing one instance even if
// they load separate copies of this module.
const KEY = Symbol.for('dsh-remote-server.runtime')

export function publishRuntime(runtime) {
  globalThis[KEY] = runtime
  return () => {
    if (globalThis[KEY] === runtime) delete globalThis[KEY]
  }
}

export function getRuntime() {
  const runtime = globalThis[KEY]
  if (!runtime) throw new Error('Remote Server is still starting. Try again in a moment.')
  return runtime
}
