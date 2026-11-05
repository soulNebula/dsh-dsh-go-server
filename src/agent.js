// Tools of the 远程服务 conversation preset.
//
// A thin shell: validate arguments, call the host runtime, return a small
// summary. No store access, no session state, no long computation here.
import { defineTool } from '@deepseek-ai/dsh-tools'

import { getRuntime } from './host/runtime.js'
import { AppError } from './host/errors.js'

export const name = 'dsh-remote-server-agent'
export const inject = ['tools', 'systemPrompt']

export const TOOL_GUIDE = `## 远程服务 tools
- rsm_status：查看本机自建 ds-harness-remote 服务端的状态（运行中/停止、端口、账号、设备数）。
- rsm_service：启动、停止或重启服务端（action = start | stop | restart）。启动会等到健康检查通过。
- rsm_account：修改服务端的账号邮箱或密码（写入 apps/server/.env，重启服务后生效）。
- rsm_devices：登录服务端账号后列出已授权设备（host / client、在线状态、最后活跃）。
这些工具只操作本机的自建服务端。改账号或密码后要调用 rsm_service(action="restart") 才生效；
它们不会把密码回显给模型或用户。`

const STATE_LABEL = { running: '运行中', degraded: '端口在监听但健康检查失败', stopped: '已停止' }

function action(value) {
  const text = String(value ?? '').trim().toLowerCase()
  if (text === 'start' || text === 'stop' || text === 'restart') return text
  throw new AppError('bad-action', 'action 只能是 start、stop 或 restart。')
}

function summary(status) {
  return [
    `${STATE_LABEL[status.state] ?? status.state} · 端口 ${status.port}`,
    status.publicUrl ? `地址 ${status.publicUrl}` : null,
    status.account ? `账号 ${status.account}` : '账号未配置',
    status.passwordSet ? '密码已设置' : '密码未设置',
    status.pid ? `PID ${status.pid}` : null,
  ].filter(Boolean).join(' · ')
}

export function apply(ctx) {
  ctx.systemPrompt.section({
    name: 'dsh-remote-server:tools',
    order: 2900,
    interpolate: false,
    text: TOOL_GUIDE,
  })

  const runtimeOf = async () => {
    const runtime = getRuntime()
    await runtime.ready
    return runtime
  }

  ctx.tools.register(defineTool({
    name: 'rsm_status',
    description: '查看本机自建 ds-harness-remote 服务端的状态：是否运行、端口、对外地址、账号和密码是否已配置、PID。',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          state: { type: 'string', required: true },
          port: { type: 'number', required: true },
          url: { type: 'string', required: true },
          publicUrl: { type: 'string' },
          account: { type: 'string' },
          passwordSet: { type: 'boolean', required: true },
          pid: { type: 'number' },
          installed: { type: 'boolean', required: true },
          summary: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.summary }],
    },
    timeoutMs: 20_000,
    async execute() {
      const runtime = await runtimeOf()
      const status = await runtime.server.status()
      return {
        state: status.state,
        port: status.port,
        url: status.url,
        publicUrl: status.publicUrl ?? undefined,
        account: status.account ?? undefined,
        passwordSet: status.passwordSet,
        pid: status.pid ?? undefined,
        installed: status.installed,
        summary: summary(status),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'rsm_service',
    description: '启动、停止或重启本机的 ds-harness-remote 服务端。启动会等待 /health 通过；停止会等待端口释放。',
    parameters: {
      action: {
        type: 'string',
        required: true,
        description: 'start | stop | restart',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', required: true },
          state: { type: 'string', required: true },
          port: { type: 'number', required: true },
          summary: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `${value.action} 完成：${value.summary}` }],
    },
    timeoutMs: 60_000,
    async execute(args) {
      const runtime = await runtimeOf()
      const verb = action(args?.action)
      const status = verb === 'start'
        ? await runtime.server.start()
        : verb === 'stop'
          ? await runtime.server.stop()
          : await runtime.server.restart()
      return { action: verb, state: status.state, port: status.port, summary: summary(status) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'rsm_account',
    description: '修改自建服务端的账号邮箱或密码。只传要改的字段；写入 apps/server/.env 后需要重启服务才生效。',
    parameters: {
      email: { type: 'string', description: '新的账号邮箱，例如 name@example.com' },
      password: { type: 'string', description: '新密码，至少 12 位，不能含空格' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          changed: { type: 'boolean', required: true },
          needsRestart: { type: 'boolean', required: true },
          fields: {
            type: 'array',
            required: true,
            items: { type: 'string' },
          },
          message: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.message }],
    },
    timeoutMs: 20_000,
    async execute(args) {
      const runtime = await runtimeOf()
      const patch = {}
      if (args?.email !== undefined && String(args.email).trim() !== '') patch.account = args.email
      if (args?.password !== undefined && String(args.password) !== '') patch.password = args.password
      if (!Object.keys(patch).length) throw new AppError('nothing-to-change', '没有提供要修改的邮箱或密码。')
      const result = await runtime.server.saveConfig(patch)
      return {
        changed: result.changed,
        needsRestart: result.needsRestart,
        fields: result.fields,
        message: result.needsRestart
          ? `已保存 ${result.fields.join('、')}。需要重启服务后生效（可调用 rsm_service 传 restart）。`
          : '没有变化。',
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'rsm_devices',
    description: '登录服务端账号后列出已授权设备。未登录时返回 signedIn=false 和提示。',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          signedIn: { type: 'boolean', required: true },
          account: { type: 'string' },
          devices: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                deviceId: { type: 'string', required: true },
                name: { type: 'string', required: true },
                role: { type: 'string', required: true },
                online: { type: 'boolean', required: true },
                lastSeenAt: { type: 'number' },
              },
            },
          },
          message: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.message }],
    },
    timeoutMs: 20_000,
    async execute() {
      const runtime = await runtimeOf()
      const info = runtime.server.sessionInfo()
      if (!info.signedIn) {
        return { signedIn: false, devices: [], message: '还没有登录服务端账号，请在「远程服务」页面登录后再查看设备。' }
      }
      const { items } = await runtime.server.devices()
      const lines = items.map(device => `- ${device.name}（${device.role}${device.online ? '，在线' : ''}）`)
      return {
        signedIn: true,
        account: info.account ?? undefined,
        devices: items.map(device => ({
          deviceId: device.deviceId,
          name: device.name,
          role: device.role,
          online: device.online,
          lastSeenAt: device.lastSeenAt ?? undefined,
        })),
        message: items.length ? `账号 ${info.account} 下的设备：\n${lines.join('\n')}` : `账号 ${info.account} 下还没有设备。`,
      }
    },
  }))
}
