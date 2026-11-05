# 远程服务 / dsh-remote-server

一个 DSH 产品型插件：在 DSH 侧栏里管理这台电脑上自建的
[ds-harness-remote](https://github.com/liguobao/ds-harness-remote) 服务端。

## 能做什么

- **服务**：启动 / 停止 / 重启本机 `apps/server` 里的服务端进程，看状态、端口、PID、健康检查延迟。
- **账号**：改账号邮箱、改密码（写入 `apps/server/.env`，重启服务后生效），保存前可先「测试登录」。
- **登录**：用账号密码登录服务端，查看已授权设备；退出登录。
- **设备**：列出 host / client 设备、在线状态、最后活跃，可重命名。
- **日志**：读 `server.out.log` 尾部（token 和密码已脱敏）。
- **设置页**：插件版本、源码目录、数据目录、配置文件、`DSH_HOME`、服务端 `.env` / `data` / 日志路径（都可一键复制），以及电脑端注册 Host、手机连接、日常维护的完整步骤。
- **Agent 工具**：`rsm_status` / `rsm_service` / `rsm_account` / `rsm_devices`（只读文件的安全预设）。

## 结构（四层）

```
src/core/model.js             纯领域：邮箱/密码/端口校验、dotenv 读写、状态判定、日志脱敏
src/host/features/remote-server.js  用例：进程发现、启停、健康检查、服务端 API、会话
src/host/{store,jobs,rpc,prefs,runtime,errors}.js   基础设施
src/index.js                  host 入口：装配服务、注册 /remote-server RPC
src/agent.js                  Agent 工具薄壳
src/client.jsx                侧栏入口 + 全页
src/ui/                       React 页面（api 只走 ./api.js）
tests/                        core / rpc / package 契约测试
```

依赖方向只有 `ui → host → core`、`agent → host`，`core` 不碰 Node/DOM。

## 关键契约

- 密码只在 host 侧：页面只会拿到 `passwordSet: true`，永远拿不到值。
- `.env` 只改指定 key，注释与其它行原样保留；写盘走临时文件 + rename。
- 启停是长操作（启动要等 `/health`），走 `jobs`，页面用 `follow()` 轮询。
- 设备描述符里的 `identityKey` 在 `core` 里就被剥掉，不会到浏览器。

## 命令

```bash
pnpm install
pnpm test
pnpm run build
pnpm run check
```

## 装进 DSH

插件页里用本地目录安装：

```bash
dsh plugin --profile desktop add link:<本仓库绝对路径>
```

host 侧改动需要完全退出并重开 DSH；只改页面可刷新。

## 数据

- 插件数据：`$DSH_HOME/dsh-remote-server/`（只记 `rootDir` 等非敏感项）
- 账号密码：服务端自己的 `apps/server/.env`
- 登录会话：仅内存，DSH 重启后需重新登录
