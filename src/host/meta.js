// Identity and on-disk locations of this plugin installation. The settings
// page shows them so a user can find the source, the config and the log
// without guessing where DSH installed things.
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { serverPaths } from './features/remote-server.js'
import { resolveDshHome } from './store.js'

export const DEFAULT_ROOT = 'C:\\dsh-remote'

export function createMeta({ store, prefs, envVars = process.env }) {
  return async function meta() {
    // The bundle lives at <plugin>/lib/index.js, so two levels up is the
    // package root whether it is linked from source or installed from npm.
    const libDir = dirname(fileURLToPath(import.meta.url))
    const sourceDir = dirname(libDir)
    let version = 'unknown'
    try {
      const pkg = JSON.parse(await readFile(join(sourceDir, 'package.json'), 'utf8'))
      if (typeof pkg.version === 'string' && pkg.version.trim()) version = pkg.version.trim()
    } catch {
      // keep "unknown"
    }

    const rootDir = prefs.read().rootDir || envVars.DSH_REMOTE_ROOT || DEFAULT_ROOT
    const server = serverPaths(rootDir)
    return {
      version,
      sourceDir,
      libDir,
      dshHome: resolveDshHome(envVars),
      dataDir: store.paths.root,
      prefsFile: store.paths.prefs(),
      channel: '/remote-server',
      platform: process.platform,
      server: {
        rootDir,
        dir: server.dir,
        envFile: server.env,
        entry: server.entry,
        logFile: server.log,
        stateFile: join(server.dir, 'data', 'state.json'),
      },
    }
  }
}
