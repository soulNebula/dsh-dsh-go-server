// The only browser↔host contract used by the UI.
// call(): request/response; follow(): poll a job with `since`; cancel(): really cancel.
export class ApiError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

const CHANNEL = '/remote-server'
const POLL_MS = 650

export function createApi(rpc, { channel = CHANNEL, intervalMs = POLL_MS } = {}) {
  // Every request must carry a JSON object as its payload: the connection
  // gateway rejects a message whose `payload` key is missing (that is the
  // "invalid client-request message" error), so a call without arguments still
  // sends `{}`.
  async function call(endpoint, payload) {
    let result
    try {
      result = await rpc.call(channel, endpoint, payload ?? {})
    } catch {
      throw new ApiError('connection', 'Cannot reach the plugin.')
    }
    if (!result?.ok) throw new ApiError(result?.error?.code ?? 'failed', result?.error?.message ?? 'Request failed.')
    return result.value
  }

  async function follow(jobOrPromise, { onProgress, onPartial, onPreview, signal } = {}) {
    const job = jobOrPromise?.id ? jobOrPromise : await jobOrPromise
    let since = 0
    for (;;) {
      signal?.throwIfAborted()
      const snapshot = await call('job/get', { id: job.id, since })
      if (snapshot?.status === 'missing') throw new ApiError('missing', 'The task was lost.')
      onProgress?.(snapshot.progress, snapshot)
      if (snapshot.partial?.length) {
        onPartial?.(snapshot.partial, snapshot)
        since = snapshot.partialCount
      }
      if (snapshot.preview !== undefined) onPreview?.(snapshot.preview)
      if (snapshot.status === 'done') return snapshot.result
      if (snapshot.status === 'failed' || snapshot.status === 'cancelled') {
        throw new ApiError(snapshot.error?.code ?? snapshot.status, snapshot.error?.message ?? 'Task failed.')
      }
      await new Promise(resolve => { setTimeout(resolve, intervalMs) })
    }
  }

  const cancel = id => call('job/cancel', { id })

  return { call, follow, cancel }
}
