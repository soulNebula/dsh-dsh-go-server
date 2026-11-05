// Browser → ds-harness-remote plugin control channel.
//
// The Remote plugin exposes a loopback-only RPC prefix on the DSH web server
// (`/ds-harness-remote/<method>`). Its own UI calls it with the same envelope
// used by the DSH gateway, so this page can drive it the same way — same
// origin, same session cookie, no extra configuration.
const PREFIX = 'ds-harness-remote'

export class RemoteControlError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'RemoteControlError'
    this.code = code
  }
}

export function createRemoteControl({ baseUrl = () => document.baseURI, fetchImpl = (...args) => fetch(...args) } = {}) {
  let sequence = 0

  return async function control(method, payload = {}, signal) {
    const rpcId = `dsh-remote-server-${++sequence}`
    let url
    try {
      url = new URL(`${PREFIX}/${method}`, baseUrl())
    } catch {
      throw new RemoteControlError('unavailable', '当前页面无法定位 DSH 服务地址。')
    }

    let response
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId, method, payload }),
        signal,
      })
    } catch (error) {
      throw new RemoteControlError('unavailable', '连不上 Remote 插件，请确认它已安装并在运行。')
    }

    if (!response.ok) {
      throw new RemoteControlError(`http-${response.status}`, `Remote 控制通道返回 HTTP ${response.status}（Remote 插件可能未安装）。`)
    }

    const envelope = await response.json().catch(() => null)
    if (!envelope || envelope.type !== 'server-response' || envelope.rpcId !== rpcId || !envelope.result) {
      throw new RemoteControlError('invalid', 'Remote 控制通道返回了无法识别的响应。')
    }
    if (envelope.result.ok !== true) {
      const error = envelope.result.error ?? {}
      throw new RemoteControlError(String(error.code ?? 'rejected'), String(error.message ?? 'Remote 插件拒绝了这次操作。'))
    }
    return envelope.result.value
  }
}
