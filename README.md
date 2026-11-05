# 远程服务 · dsh-remote-server

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件：在侧栏管理**本机自建的 [ds-harness-remote](https://github.com/liguobao/ds-harness-remote) 服务端**，并把「改 Remote Server 地址 / 把电脑注册成 Host」也收进同一个页面，方便手机（DSH Go）连过来。

> 适用：DSH 0.2.x（在 `0.2.2-rc.1` 上开发与验证）、Node 22、Windows / Linux。

---

## 它能做什么

| 区块 | 能力 |
| --- | --- |
| **服务状态** | 运行中 / 降级 / 已停止，端口、对外地址、账号、PID、健康检查延迟；**启动 / 停止 / 重启**（启动会等 `/health` 通过） |
| **账号与地址** | 改账号邮箱、改密码（写入 `apps/server/.env`，重启生效）、**测试登录**、登录 / 退出、改端口与服务目录 |
| **Remote 主机** | 显示并修改 Remote 插件的 Server 地址、切换主机模式、**登录并注册 Host** —— 不用再去 Remote 面板点 |
| **设备** | 登录后列出 host / client 设备、在线状态、最后活跃时间，可重命名 |
| **服务日志** | 读取 `server.out.log` 尾部，token 与密码自动脱敏 |
| **设置页** | 插件版本、源码目录、数据目录、配置文件、`DSH_HOME`、服务端 `.env` / 数据 / 日志路径（可一键复制），以及完整使用步骤 |
| **Agent 工具** | `rsm_status` / `rsm_service` / `rsm_account` / `rsm_devices`，挂在只读文件的安全预设里 |

---

## 前置条件

1. DSH 已安装并能正常启动插件（0.2.x）。
2. 本机已部署 ds-harness-remote 服务端，默认目录 `C:\dsh-remote`，即存在：
   ```
   C:\dsh-remote\apps\server\.env           # DSH_SERVER_ACCOUNT / DSH_SERVER_PASSWORD / DSH_SERVER_PORT ...
   C:\dsh-remote\apps\server\dist\main.js
   ```
   目录不同也没关系，在插件「服务目录」里改。
3. 部署方式见 [ds-harness-remote 的 apps/server](https://github.com/liguobao/ds-harness-remote/tree/main/apps/server)。

---

## 安装

本插件未发布到 npm，用本地目录安装：

```bash
# 放进 DSH 的插件目录
git clone https://github.com/soulNebula/dsh-dsh-go-server.git C:/Users/<你>/.dsh/plugins/dsh-remote-server
cd C:/Users/<你>/.dsh/plugins/dsh-remote-server
pnpm install && pnpm run build

# 链接到 desktop profile
dsh plugin --profile desktop add link:<上面这个绝对路径>
```

也可以在 DSH 的插件页里用「本地目录」安装。装好后**完全重启 DSH**（host 侧改动刷新不够）。

---

## 使用

### 1. 管服务端

打开侧栏 **远程服务 → 概览**：

- 「启动 / 停止 / 重启」直接控制服务端进程；
- 「载入日志」看最近输出；
- 「账号与地址」改邮箱、密码（至少 12 位）、端口、对外地址（手机填这个），保存后按提示重启服务；
- 「测试登录」可以先用表单里的密码验证，验过再保存；
- 「登录账号」用**已保存的** `.env` 账号登录，用来查看设备。

> 改密码或邮箱后：点「重启」→ 已连的设备需要重新授权。

### 2. 把电脑注册成 Host

同一个页面的 **Remote 主机** 卡片：

1. **Remote Server 地址** 填服务端地址（例如 `http://192.168.31.62:8080`）→「保存地址」；
   返回 `applies: "live"` 立即生效，返回 `restart` 则需重启 DSH。
2. 模式不是主机时点「设为主机」。
3. 填 **Server 账号邮箱** 和 **Server 账号密码** →「登录并注册 Host」。
4. 卡片里 Host 注册变成「已注册」，侧栏 **Remote** 面板显示「在线」。

### 3. 手机连接

手机 DSH Go：

1. 对话列表底部点主机名 → **切换主机** → **连接电脑或服务器** → **自建服务器**；
2. 服务器地址、账号、密码与上面一致；
3. 选中这台电脑 → 核对指纹（与电脑端一致）→ **信任并连接**；
4. 选工作区开始。手机与电脑需在**同一局域网**。

---

## 架构

按 dsh-plugin-product-framework 的四层组织，依赖只向下：

```
ui ──api/RPC──▶ host ──纯函数──▶ core
agent ──runtime──▶ host
```

```
src/core/model.js                  纯领域：邮箱/密码/端口校验、dotenv 读写、状态判定、日志脱敏、设备归一化
src/host/features/remote-server.js 用例：进程发现、启停、健康检查、服务端 API、会话、.env 持久化
src/host/meta.js                   安装信息：版本、源码/数据/配置路径
src/host/{store,jobs,rpc,prefs,runtime,errors}.js   基础设施（原子写、任务轮询、RPC 信封、偏好）
src/index.js                       host 入口：装配服务、注册 /remote-server RPC
src/agent.js                       Agent 工具薄壳
src/client.jsx                     侧栏入口 + 主页面
src/ui/                            React 页面；api.js 是唯一 RPC 出口，remote-control.js 调 Remote 插件控制通道
tests/                             node:test：core / RPC 信封 / 打包契约
```

数据流（一次启停）：

```
按钮 → api.call('server/start') → RPC(信封校验) → jobs.start
     → spawn node --env-file=.env dist/main.js → 轮询 /health
     → job/get 轮询 → 状态回到页面
```

### 与 Remote 插件的关系

「Remote 主机」卡片不重写协议，而是调用 ds-harness-remote 自己暴露的 loopback 控制通道（同源 + 会话 cookie）：

```
POST /ds-harness-remote/settings.get          → 当前配置与注册状态
POST /ds-harness-remote/settings.server.set   → { serverUrl }
POST /ds-harness-remote/settings.role.set     → { role: 'host' }
POST /ds-harness-remote/host.account.login    → { email, password }
```

消息信封与 DSH 网关一致：`{ type: 'client-request', rpcId, method, payload }`。

---

## 安全

- **密码不出 host**：页面只拿得到 `passwordSet: true`；注册 Host 时需要现场输入一次密码，不会从 `.env` 回填到浏览器。
- `.env` 写入只改指定 key，注释与其它行原样保留；写盘是临时文件 + rename。
- 服务端登录 token 仅存内存，DSH 重启即失效，不落盘、不返回页面。
- 设备描述符里的 `identityKey` 在 core 就被剥掉。
- 日志返回前脱敏（`token=`、`DSH_SERVER_PASSWORD=`、`Bearer`）。

---

## 配置项

| 位置 | 内容 |
| --- | --- |
| `$DSH_HOME/dsh-remote-server/prefs.json` | 插件记住的服务目录等非敏感项 |
| `<服务目录>/apps/server/.env` | 服务端账号、密码、端口、对外地址 |
| `<服务目录>/apps/server/data/state.json` | 服务端设备与 token（删除等于清空所有授权） |
| `<服务目录>/apps/server/server.out.log` | 服务端输出 |

环境变量（可选）：

- `DSH_REMOTE_ROOT`：默认服务目录（默认 `C:\dsh-remote`）
- `DSH_REMOTE_NODE`：指定启动服务端用的 node 可执行文件

---

## 开发

```bash
pnpm install
pnpm test        # 24 项 node:test
pnpm run build   # tsdown：host(ESM) + client(CJS)
pnpm run check   # test + build
```

改完源码需要 `pnpm run build` 并**完全重启 DSH**（host 侧改动刷新不够）。`lib/` 是构建产物，不入库。

---

## 限制

- 服务端跑在本机，因此**只能在局域网使用**；外网访问需要把服务端部署到 VPS，并配域名 + HTTPS 反向代理（反代需支持 `/ws/v1/connect` 的 WebSocket Upgrade）。
- 自建服务端是单账号模型；改密码需要设备重新授权。
- 服务端没有开放「踢设备」的接口，插件只做查看与重命名。

---

## License

MIT，见 [LICENSE](LICENSE)。

本项目与 DeepSeek 无关，是非官方插件。ds-harness-remote 的许可证与署名见其仓库。
