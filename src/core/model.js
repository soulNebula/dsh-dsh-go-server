// Pure domain model for the self-hosted ds-harness-remote Server plugin.
//
// Nothing here touches Node, the DOM or the network: the host service, the
// browser page and the tests all share these functions verbatim.
//
// Domain vocabulary
// - Server: one `@dsh-remote/server` process on this machine, configured by
//   `apps/server/.env` and reachable on loopback.
// - Account: the single `DSH_SERVER_ACCOUNT` / `DSH_SERVER_PASSWORD` pair.
// - Device: a host/client row the Server knows about after sign-in.

export const LIMITS = Object.freeze({
  email: 254,
  passwordMin: 12,
  passwordMax: 128,
  name: 80,
  rootDir: 400,
  logLines: 200,
  deviceId: 128,
})

const CONTROL = /[\u0000-\u001f\u007f]/gu
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u
const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/u

/** Trim, strip control characters, cap at `max`. */
export function text(value, max = LIMITS.name) {
  return String(value ?? '').replace(CONTROL, ' ').trim().slice(0, max)
}

/** The account name. Lowercased: the Server compares it exactly. */
export function normalizeEmail(raw) {
  const value = text(raw, LIMITS.email).toLowerCase()
  if (!EMAIL.test(value)) throw new TypeError('邮箱格式不正确（示例：name@example.com）')
  return value
}

/** The Server rejects anything shorter than 12 characters. */
export function normalizePassword(raw) {
  const value = String(raw ?? '')
  if (value.length < LIMITS.passwordMin) throw new TypeError(`密码至少 ${LIMITS.passwordMin} 位`)
  if (value.length > LIMITS.passwordMax) throw new TypeError('密码太长')
  if (/[\s\u0000-\u001f]/u.test(value)) throw new TypeError('密码不能包含空格或控制字符')
  return value
}

export function normalizePort(raw) {
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new TypeError('端口必须是 1024–65535 之间的整数')
  }
  return value
}

export function normalizeRootDir(raw) {
  const value = String(raw ?? '').trim()
  if (!value) throw new TypeError('服务目录不能为空')
  if (value.length > LIMITS.rootDir) throw new TypeError('服务目录过长')
  if (CONTROL.test(value)) throw new TypeError('服务目录包含非法字符')
  return value.replace(/[\\/]+$/u, '')
}

export function normalizeDeviceId(raw) {
  const value = text(raw, LIMITS.deviceId)
  if (!/^[A-Za-z0-9_-]{4,128}$/u.test(value)) throw new TypeError('设备 ID 不正确')
  return value
}

/**
 * Parse a dotenv file into a plain object. Comments, blank lines and unknown
 * keys are ignored here; `setDotEnv` keeps them in the file.
 */
export function parseDotEnv(source) {
  const values = Object.create(null)
  for (const raw of String(source ?? '').split(/\r?\n/u)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    if (!ENV_KEY.test(key)) continue
    let value = line.slice(eq + 1).trim()
    if (value.length >= 2) {
      const first = value[0]
      const last = value[value.length - 1]
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

/**
 * Rewrite only the given keys, preserving order, comments and every other
 * line. Missing keys are appended. Always ends with exactly one newline.
 */
export function setDotEnv(source, patch) {
  const entries = Object.entries(patch ?? {}).filter(([, value]) => value !== undefined)
  if (!entries.length) return String(source ?? '')
  const pending = new Map(entries.map(([key, value]) => [key, String(value)]))
  const seen = new Set()
  const lines = String(source ?? '').split(/\r?\n/u)
  const out = lines.map(raw => {
    const trimmed = raw.trim()
    if (!trimmed || trimmed.startsWith('#')) return raw
    const eq = trimmed.indexOf('=')
    if (eq <= 0) return raw
    const key = trimmed.slice(0, eq).trim()
    if (!pending.has(key)) return raw
    seen.add(key)
    return `${key}=${pending.get(key)}`
  })
  for (const [key, value] of pending) if (!seen.has(key)) out.push(`${key}=${value}`)
  while (out.length && out[out.length - 1] === '') out.pop()
  return `${out.join('\n')}\n`
}

export const SERVICE_STATES = Object.freeze(['running', 'degraded', 'stopped'])

/**
 * - running:  listening and `/health` answered ok
 * - degraded: the port accepts connections but health failed (starting, or a
 *             different process owns the port)
 * - stopped:  nothing listens
 */
export function classifyService({ listening, healthy } = {}) {
  if (!listening) return 'stopped'
  return healthy ? 'running' : 'degraded'
}

/** `127.0.0.1` is the only address the plugin itself ever calls. */
export function loopbackUrl(port) {
  return `http://127.0.0.1:${Number(port)}`
}

/** The address the phone host uses. `0.0.0.0` means "all interfaces". */
export function publicUrlFor(host, port) {
  const value = text(host, 200)
  if (!value || value === '0.0.0.0' || value === '::') return null
  return /^https?:\/\//u.test(value) ? value.replace(/\/+$/u, '') : `http://${value}:${Number(port)}`
}

/** Strip credentials and launch tokens before a log line leaves the host. */
export function redactLine(line) {
  return String(line ?? '')
    .replace(/([?&]token=)[A-Za-z0-9._~%-]+/giu, '$1***')
    .replace(/(DSH_SERVER_PASSWORD\s*=\s*)\S+/giu, '$1***')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/giu, '$1***')
}

export function tailLines(source, count = 40) {
  const limit = Math.min(Math.max(Number(count) || 40, 1), LIMITS.logLines)
  const lines = String(source ?? '').split(/\r?\n/u)
  while (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines.slice(-limit).map(redactLine)
}

/**
 * Keep only fields the browser may see. A raw descriptor from the Server also
 * carries identity keys; they must never reach the page.
 */
export function normalizeDevice(raw) {
  if (!raw || typeof raw !== 'object') return null
  const deviceId = text(raw.deviceId, LIMITS.deviceId)
  if (!deviceId) return null
  const role = raw.role === 'host' || raw.role === 'client' ? raw.role : 'client'
  return {
    deviceId,
    name: text(raw.name, LIMITS.name) || deviceId.slice(0, 8),
    platform: text(raw.platform, 40),
    role,
    online: raw.online === true,
    lastSeenAt: Number.isFinite(raw.lastSeenAt) ? raw.lastSeenAt : null,
  }
}

export function normalizeDevices(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : []
  return items.map(normalizeDevice).filter(Boolean)
}
