// Use case: manage the self-hosted ds-harness-remote Server on this machine.
//
// The Server is an ordinary Node process described by `apps/server/.env`:
//   <root>/apps/server/.env          account, password, port, public URL
//   <root>/apps/server/dist/main.js  entry point
//   <root>/apps/server/server.out.log  stdout/stderr
//
// Everything here is host-side IO: process discovery, .env persistence, health
// probes and the Server's own HTTP API. The password never leaves this module
// in a response — callers only ever learn `passwordSet: true`.
import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { join } from 'node:path'

import {
  classifyService,
  loopbackUrl,
  normalizeDeviceId as normaliseDeviceId,
  normalizeDevices as normaliseDevices,
  normalizeEmail as normaliseEmail,
  normalizePassword as normalisePassword,
  normalizePort as normalisePort,
  normalizeRootDir as normaliseRootDir,
  parseDotEnv,
  publicUrlFor,
  setDotEnv,
  tailLines,
  text,
} from '../../core/model.js'
import { AppError } from '../errors.js'

const DEFAULT_ROOT = 'C:\\dsh-remote'
const DEFAULT_PORT = 8080
const START_TIMEOUT_MS = 20_000
const STOP_TIMEOUT_MS = 8_000
const HEALTH_TIMEOUT_MS = 1_500
const LOG_NAME = 'server.out.log'
const MAX_LOG_RESPONSE = 200

const sleep = ms => new Promise(resolve => { setTimeout(resolve, ms) })

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 5_000, windowsHide: true, ...options }, (error, stdout, stderr) => {
      if (error) reject(error)
      else resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
    })
  })
}

export function serverPaths(root) {
  const dir = join(root, 'apps', 'server')
  return {
    root,
    dir,
    env: join(dir, '.env'),
    entry: join(dir, 'dist', 'main.js'),
    log: join(dir, LOG_NAME),
  }
}

async function readText(path) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function writeAtomic(path, content) {
  const temp = `${path}.${process.pid}.${Date.now().toString(36)}.tmp`
  await writeFile(temp, content)
  try {
    await rename(temp, path)
  } catch (error) {
    await unlink(temp).catch(() => undefined)
    throw error
  }
}

/**
 * Core validators throw plain TypeErrors; only AppErrors reach the user with
 * their message. Convert here so "密码至少 12 位" is not replaced by the
 * generic "Request failed".
 */
function userFacing(task) {
  try {
    return task()
  } catch (error) {
    if (error instanceof AppError) throw error
    if (error instanceof TypeError && error.message) throw new AppError('invalid-input', error.message)
    throw error
  }
}

function canConnect(port, timeout = 900) {  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const settle = value => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(timeout)
    socket.once('connect', () => settle(true))
    socket.once('timeout', () => settle(false))
    socket.once('error', () => settle(false))
  })
}

/** Windows has no `lsof`; the listener pid comes from netstat. */
async function findPidByPort(port, platform = process.platform) {
  try {
    if (platform === 'win32') {
      const { stdout } = await execFileAsync('netstat', ['-ano', '-p', 'tcp'])
      for (const raw of stdout.split(/\r?\n/u)) {
        const line = raw.trim()
        if (!line.startsWith('TCP')) continue
        if (!line.includes(`:${port}`)) continue
        if (!/LISTENING/u.test(line)) continue
        const parts = line.split(/\s+/u)
        const pid = Number(parts[parts.length - 1])
        if (Number.isInteger(pid) && pid > 0) return pid
      }
      return null
    }
    const { stdout } = await execFileAsync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
    const pid = Number(String(stdout).trim().split(/\r?\n/u)[0])
    return Number.isInteger(pid) && pid > 0 ? pid : null
  } catch {
    return null
  }
}

async function killPid(pid, platform = process.platform) {
  if (!Number.isInteger(pid) || pid <= 0) return
  try {
    if (platform === 'win32') {
      await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], { timeout: 8_000 })
      return
    }
    process.kill(pid, 'SIGTERM')
  } catch {
    // already gone, or not ours: the caller re-checks the port instead
  }
}

export function createRemoteServerService({
  store,
  prefs,
  logger,
  fetchImpl = globalThis.fetch,
  platform = process.platform,
  execPath = process.execPath,
  envVars = process.env,
  now = Date.now,
} = {}) {
  /** Account session with the Server; memory only, never sent to the page. */
  let session = null

  const rootDir = () => prefs.read().rootDir || envVars.DSH_REMOTE_ROOT || DEFAULT_ROOT
  const paths = () => serverPaths(rootDir())

  async function readEnv() {
    const source = await readText(paths().env)
    return source === null ? null : parseDotEnv(source)
  }

  function requireInstalled() {
    const target = paths()
    if (!existsSync(target.entry)) {
      throw new AppError('not-installed', `没有找到服务端入口：${target.entry}\n请确认服务目录，或先部署 ds-harness-remote。`)
    }
    return target
  }

  function resolveNode() {
    const explicit = envVars.DSH_REMOTE_NODE
    if (explicit && existsSync(explicit)) return { command: explicit, electron: false }
    const separator = platform === 'win32' ? ';' : ':'
    const names = platform === 'win32' ? ['node.exe'] : ['node']
    for (const dir of String(envVars.PATH ?? '').split(separator)) {
      if (!dir) continue
      for (const name of names) {
        const candidate = join(dir, name)
        if (existsSync(candidate)) return { command: candidate, electron: false }
      }
    }
    // The DSH desktop ships an Electron binary; with ELECTRON_RUN_AS_NODE it
    // behaves exactly like node.
    return { command: execPath, electron: !/(?:^|[\\/])node(?:\.exe)?$/iu.test(execPath) }
  }

  async function probeHealth(url) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
    const startedAt = Date.now()
    try {
      const response = await fetchImpl(`${url}/health`, { signal: controller.signal })
      if (!response.ok) return null
      const body = await response.json().catch(() => null)
      if (body?.status !== 'ok') return null
      return { latencyMs: Date.now() - startedAt }
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  async function apiJson(url, { method = 'GET', token, body } = {}) {
    const headers = { accept: 'application/json' }
    if (token) headers.authorization = `Bearer ${token}`
    if (body !== undefined) headers['content-type'] = 'application/json'
    let response
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(8_000),
      })
    } catch (error) {
      logger?.warn?.('remote-server api %s failed: %s', url, error?.message)
      throw new AppError('unreachable', '连不上服务端，请确认服务正在运行。')
    }
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      const code = String(data?.error?.code ?? `HTTP_${response.status}`)
      throw new AppError(apiCode(code), apiMessage(code))
    }
    return data
  }

  async function status() {
    const target = paths()
    const env = await readEnv()
    const port = Number(env?.DSH_SERVER_PORT) || DEFAULT_PORT
    const url = loopbackUrl(port)
    const listening = await canConnect(port)
    const health = listening ? await probeHealth(url) : null
    const pid = listening ? await findPidByPort(port, platform) : null
    const node = resolveNode()
    return {
      state: classifyService({ listening, healthy: Boolean(health) }),
      port,
      url,
      publicUrl: env?.DSH_SERVER_PUBLIC_URL || publicUrlFor(env?.DSH_SERVER_HOST, port),
      account: env?.DSH_SERVER_ACCOUNT ?? null,
      passwordSet: Boolean(env?.DSH_SERVER_PASSWORD),
      rootDir: rootDir(),
      serverDir: target.dir,
      installed: existsSync(target.entry) && env !== null,
      pid,
      latencyMs: health?.latencyMs ?? null,
      node: node.command,
      checkedAt: now(),
    }
  }

  async function start(api) {
    const current = await status()
    if (current.state !== 'stopped') return current
    const target = requireInstalled()
    const envText = (await readText(target.env)) ?? ''
    const port = Number(parseDotEnv(envText).DSH_SERVER_PORT) || DEFAULT_PORT
    const node = resolveNode()

    await mkdir(target.dir, { recursive: true })
    const logHandle = await open(target.log, 'a')
    let child
    try {
      child = spawn(node.command, ['--env-file=.env', 'dist/main.js'], {
        cwd: target.dir,
        env: {
          ...envVars,
          ...(node.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
          NO_COLOR: '1',
        },
        detached: true,
        windowsHide: true,
        stdio: ['ignore', logHandle.fd, logHandle.fd],
      })
      child.unref()
    } finally {
      await logHandle.close().catch(() => undefined)
    }
    if (child.pid) await store.writeJson(join(store.paths.root, 'state.json'), { pid: child.pid, startedAt: now() })
    logger?.info?.('remote-server start: pid=%s port=%s', child.pid, port)

    const rounds = Math.ceil(START_TIMEOUT_MS / 500)
    for (let round = 1; round <= rounds; round += 1) {
      api?.progress?.(round, rounds, '等待服务健康检查')
      await sleep(500)
      if (await probeHealth(loopbackUrl(port))) return status()
    }
    const tail = tailLines((await readText(target.log)) ?? '', 15).join('\n')
    throw new AppError('start-timeout', `服务在 ${Math.round(START_TIMEOUT_MS / 1000)} 秒内没有就绪。${tail ? `\n${tail}` : ''}`)
  }

  async function stop(api) {
    const current = await status()
    if (current.state === 'stopped') return current
    const { port } = current
    let pid = current.pid
    if (!pid) {
      const saved = await store.readJson(join(store.paths.root, 'state.json'), null)
      if (Number.isInteger(saved?.pid)) pid = saved.pid
    }
    if (pid) await killPid(pid, platform)

    const rounds = Math.ceil(STOP_TIMEOUT_MS / 400)
    for (let round = 1; round <= rounds; round += 1) {
      api?.progress?.(round, rounds, '等待服务退出')
      await sleep(400)
      if (!(await canConnect(port, 400))) break
    }
    if (await canConnect(port, 400)) {
      const leftover = (await findPidByPort(port, platform)) ?? pid
      if (leftover) await killPid(leftover, platform)
      await sleep(500)
    }
    const result = await status()
    if (result.state !== 'stopped') {
      throw new AppError('stop-failed', '端口仍在监听，可能有别的进程占用了这个端口。')
    }
    await store.writeJson(join(store.paths.root, 'state.json'), { pid: null, stoppedAt: now() })
    logger?.info?.('remote-server stopped on port %s', port)
    return result
  }

  async function restart(api) {
    await stop(api)
    return start(api)
  }

  async function config() {
    const current = await status()
    return {
      rootDir: current.rootDir,
      serverDir: current.serverDir,
      installed: current.installed,
      account: current.account,
      passwordSet: current.passwordSet,
      port: current.port,
      publicUrl: current.publicUrl,
      node: current.node,
    }
  }

  async function saveConfig(patch = {}) {
    const previousRoot = rootDir()
    const nextRoot = patch.rootDir === undefined || patch.rootDir === null || String(patch.rootDir).trim() === ''
      ? previousRoot
      : userFacing(() => normaliseRootDir(patch.rootDir))
    const target = serverPaths(nextRoot)
    if (!existsSync(target.entry)) {
      throw new AppError('not-installed', `没有找到服务端入口：${target.entry}`)
    }
    const existing = (await readText(target.env)) ?? ''
    const envPatch = {}
    if (patch.account !== undefined && String(patch.account).trim() !== '') envPatch.DSH_SERVER_ACCOUNT = userFacing(() => normaliseEmail(patch.account))
    if (patch.password !== undefined && String(patch.password) !== '') envPatch.DSH_SERVER_PASSWORD = userFacing(() => normalisePassword(patch.password))
    if (patch.port !== undefined && String(patch.port).trim() !== '') envPatch.DSH_SERVER_PORT = String(userFacing(() => normalisePort(patch.port)))
    if (patch.publicUrl !== undefined && String(patch.publicUrl).trim() !== '') {
      const value = text(patch.publicUrl, 300).replace(/\/+$/u, '')
      if (!/^https?:\/\/[^\s]+$/u.test(value)) throw new AppError('bad-public-url', '公网地址必须以 http:// 或 https:// 开头')
      envPatch.DSH_SERVER_PUBLIC_URL = value
    }
    const moved = nextRoot !== previousRoot
    if (!moved && Object.keys(envPatch).length === 0) {
      return { changed: false, needsRestart: false, fields: [], config: await config() }
    }
    if (Object.keys(envPatch).length) await writeAtomic(target.env, setDotEnv(existing, envPatch))
    if (moved) await prefs.save({ rootDir: nextRoot })
    // The account/password is what the existing session was minted with.
    if (envPatch.DSH_SERVER_ACCOUNT || envPatch.DSH_SERVER_PASSWORD) session = null
    logger?.info?.('remote-server config saved: %s', Object.keys(envPatch).join(',') || 'rootDir')
    return {
      changed: true,
      needsRestart: Object.keys(envPatch).length > 0,
      fields: Object.keys(envPatch),
      config: await config(),
    }
  }

  async function storedCredentials() {
    const env = await readEnv()
    if (!env?.DSH_SERVER_ACCOUNT || !env?.DSH_SERVER_PASSWORD) {
      throw new AppError('no-credentials', '还没有配置账号和密码，请先在「账号」里填写并保存。')
    }
    return { email: env.DSH_SERVER_ACCOUNT, password: env.DSH_SERVER_PASSWORD }
  }

  function sessionInfo() {
    if (session?.expiresAt && session.expiresAt <= now()) session = null
    return { signedIn: Boolean(session), account: session?.account ?? null, expiresAt: session?.expiresAt ?? null }
  }

  async function login() {
    const current = await status()
    if (current.state === 'stopped') throw new AppError('server-stopped', '服务没有运行，先启动服务再登录。')
    // Sign-in always uses the account saved in `.env`. The password field on
    // the page is for *changing* the password, so it must never be required
    // here — an empty field used to be validated as a password and surfaced
    // as the generic "Request failed".
    const credentials = await storedCredentials()
    const body = {
      email: userFacing(() => normaliseEmail(credentials.email)),
      password: credentials.password,
    }
    const data = await apiJson(`${current.url}/api/v1/auth/login`, { method: 'POST', body })
    session = {
      token: data?.token,
      account: String(data?.account ?? body.email),
      expiresAt: Number(data?.expiresAt) || null,
    }
    logger?.info?.('remote-server signed in as %s', session.account)
    return sessionInfo()
  }

  async function testCredentials(payload = {}) {
    const current = await status()
    if (current.state === 'stopped') throw new AppError('server-stopped', '服务没有运行，先启动服务再测试。')
    const stored = await readEnv().catch(() => null)
    const email = userFacing(() => normaliseEmail(payload.email || stored?.DSH_SERVER_ACCOUNT || ''))
    const password = payload.password
      ? userFacing(() => normalisePassword(payload.password))
      : userFacing(() => normalisePassword(stored?.DSH_SERVER_PASSWORD ?? ''))
    const data = await apiJson(`${current.url}/api/v1/auth/login`, { method: 'POST', body: { email, password } })
    if (data?.token) {
      await apiJson(`${current.url}/api/v1/auth/logout`, { method: 'POST', token: data.token }).catch(() => undefined)
    }
    return { ok: true, account: String(data?.account ?? email) }
  }

  async function logout() {
    const previous = session
    session = null
    if (!previous) return sessionInfo()
    const current = await status().catch(() => null)
    if (current && current.state !== 'stopped') {
      await apiJson(`${current.url}/api/v1/auth/logout`, { method: 'POST', token: previous.token }).catch(() => undefined)
    }
    return sessionInfo()
  }

  async function devices() {
    const info = sessionInfo()
    if (!info.signedIn) throw new AppError('signed-out', '先登录账号才能查看设备。')
    const current = await status()
    const data = await apiJson(`${current.url}/api/v1/account/devices`, { token: session.token })
    return { account: info.account, items: normaliseDevices(data) }
  }

  async function renameDevice(payload = {}) {
    const deviceId = userFacing(() => normaliseDeviceId(payload.deviceId))
    const name = text(payload.name, 80)
    if (!name) throw new AppError('bad-name', '设备名称不能为空')
    if (!sessionInfo().signedIn) throw new AppError('signed-out', '先登录账号才能改设备名。')
    const current = await status()
    const data = await apiJson(`${current.url}/api/v1/devices/${encodeURIComponent(deviceId)}/name`, {
      method: 'POST',
      token: session.token,
      body: { name },
    })
    return { device: data }
  }

  async function logs(payload = {}) {
    const target = paths()
    const raw = (await readText(target.log)) ?? ''
    const requested = Number(payload.lines) || 40
    return { lines: tailLines(raw, Math.min(requested, MAX_LOG_RESPONSE)), path: target.log }
  }

  return Object.freeze({
    status,
    start,
    stop,
    restart,
    config,
    saveConfig,
    testCredentials,
    login,
    logout,
    sessionInfo,
    devices,
    renameDevice,
    logs,
  })
}

function apiCode(code) {
  switch (code) {
    case 'AUTH_INVALID': return 'auth-invalid'
    case 'ACCOUNT_AUTH_REQUIRED': return 'signed-out'
    case 'RATE_LIMITED': return 'rate-limited'
    case 'MEMBERSHIP_REQUIRED': return 'forbidden'
    case 'INVALID_MESSAGE': return 'invalid'
    default: return 'server-error'
  }
}

function apiMessage(code) {
  switch (code) {
    case 'AUTH_INVALID': return '邮箱或密码不对。'
    case 'ACCOUNT_AUTH_REQUIRED': return '登录已过期，请重新登录。'
    case 'RATE_LIMITED': return '请求太频繁，稍后再试。'
    case 'MEMBERSHIP_REQUIRED': return '当前账号没有这个权限。'
    case 'INVALID_MESSAGE': return '服务端不接受这个请求。'
    default: return '服务端返回了错误。'
  }
}
