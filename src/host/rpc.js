// Browser ↔ host contract: one channel, one route table, one envelope.
// Every payload is validated by the route itself; only user-facing errors
// leave the host.
import { AppError, publicCode, publicMessage } from './errors.js'

export function isOwner(peer) {
  // This DSH version hands the peer as `{ principal: { kind: 'owner' } }`;
  // older ones used `{ principal: 'owner' }`. Accept both, plus the undefined
  // peer of an in-process call.
  return peer === undefined
    || peer?.principal?.kind === 'owner'
    || peer?.principal === 'owner'
    || peer?.kind === 'owner'
}

/**
 * @param routes { [endpoint: string]: (payload, signal) => unknown }
 * @param options {{ logger?: any, checkPeer?: (peer: any) => boolean }}
 * @returns handler(endpoint, payload, signal, peer) → { ok, value|error }
 */
export function createRpcHandler(routes, { logger, checkPeer = isOwner } = {}) {
  return async function handler(endpoint, payload, signal, peer) {
    try {
      if (!checkPeer(peer)) {
        return { ok: false, error: { code: 'app/forbidden', message: 'Not allowed', details: {} } }
      }
      const route = Object.hasOwn(routes, endpoint) ? routes[endpoint] : undefined
      if (typeof route !== 'function') {
        return { ok: false, error: { code: 'app/unknown-endpoint', message: 'Unknown endpoint', details: {} } }
      }
      const value = await route(payload ?? {}, signal)
      return { ok: true, value }
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error
      if (!(error instanceof AppError)) logger?.warn?.('rpc %s failed: %s', endpoint, error?.message)
      return {
        ok: false,
        error: { code: `app/${publicCode(error)}`, message: publicMessage(error), details: {} },
      }
    }
  }
}
