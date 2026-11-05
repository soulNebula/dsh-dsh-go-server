// Host entry of 远程服务 (dsh-remote-server).
//
// Wires the infrastructure (store / prefs / jobs / RPC), the use case that
// manages the self-hosted ds-harness-remote Server, and publishes the runtime
// the agent entry reads.
import { join } from 'node:path'

import { AppError } from './host/errors.js'
import { createRemoteServerService } from './host/features/remote-server.js'
import { createJobs } from './host/jobs.js'
import { createMeta } from './host/meta.js'
import { createPrefs } from './host/prefs.js'
import { createRpcHandler } from './host/rpc.js'
import { publishRuntime } from './host/runtime.js'
import { createStore, resolveDshHome } from './host/store.js'

export const name = 'dsh-remote-server'
export const CHANNEL = '/remote-server'

export const inject = []

export function apply(ctx) {
  const logger = ctx.logger
  const store = createStore({ root: join(resolveDshHome(), 'dsh-remote-server') })
  const prefs = createPrefs(store)
  const jobs = createJobs({ logger })
  const server = createRemoteServerService({ store, prefs, logger })
  const meta = createMeta({ store, prefs })

  const ready = prefs.load().catch(() => undefined)
  const afterReady = task => async payload => {
    await ready
    return task(payload)
  }

  // Start/stop/restart wait for the health probe, so they run as jobs the page
  // can poll. A failure is returned as a result (not a thrown error) so the
  // real reason survives the job envelope instead of becoming "job failed".
  const serviceJob = verb => async () => jobs.start(verb, async api => {
    try {
      return await server[verb](api)
    } catch (error) {
      const message = error instanceof AppError ? error.message : '操作失败'
      logger?.warn?.('remote-server %s failed: %s', verb, error?.message)
      const current = await server.status().catch(() => null)
      return { failed: true, message, state: current?.state ?? 'unknown' }
    }
  })

  const routes = {
    'app/info': afterReady(async () => {
      const info = await meta()
      return { version: info.version, channel: CHANNEL }
    }),
    // Identity and file locations for the settings page.
    'app/meta': afterReady(() => meta()),

    'server/status': afterReady(() => server.status()),
    'server/start': afterReady(serviceJob('start')),
    'server/stop': afterReady(serviceJob('stop')),
    'server/restart': afterReady(serviceJob('restart')),

    'config/get': afterReady(() => server.config()),
    'config/save': afterReady(payload => server.saveConfig(payload ?? {})),

    'account/test': afterReady(payload => server.testCredentials(payload ?? {})),
    'account/login': afterReady(payload => server.login(payload ?? {})),
    'account/logout': afterReady(() => server.logout()),
    'account/session': afterReady(() => server.sessionInfo()),

    'devices/list': afterReady(() => server.devices()),
    'devices/rename': afterReady(payload => server.renameDevice(payload ?? {})),

    'logs/tail': afterReady(payload => server.logs(payload ?? {})),

    'job/get': payload => jobs.get(String(payload?.id ?? ''), { since: Math.max(0, Number(payload?.since) || 0) }) ?? { status: 'missing' },
    'job/cancel': payload => jobs.cancel(String(payload?.id ?? '')),
  }

  const handler = createRpcHandler(routes, { logger })

  // Shipped Connection versions read webServer from the caller's context;
  // register with this injected context so a first hot install mounts the
  // channel.
  ctx.inject(['connection', 'webServer'], connectionCtx => {
    const service = connectionCtx.connection
    connectionCtx.effect(
      () => (typeof service.register === 'function'
        ? service.register(connectionCtx, CHANNEL, handler)
        : service.rpc.handle(CHANNEL, handler)),
      'rpc channel',
    )
  })

  ctx.effect(() => publishRuntime({ store, prefs, jobs, server, ready }), 'runtime')
  ctx.effect(() => () => jobs.dispose(), 'jobs')
}

export { AppError }
