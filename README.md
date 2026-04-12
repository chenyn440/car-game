# Turbo Drift Web

QQ飞车风格的网页竞速原型：伪3D赛道、漂移、氮气、道具、AI对抗与本地排行榜。

## 当前实现

- 伪3D赛道渲染（Canvas）
- 4车竞速（玩家 + 3 AI）
- 漂移蓄力、氮气冲刺
- 道具系统：导弹、香蕉、护盾、加速
- 3圈计时与名次结算
- 本地 SQLite 排行榜（`better-sqlite3`）
- PC键盘 + 手机触控按钮

## 本地运行

```bash
npm install
npm run dev
```

默认地址：`http://localhost:5173`

`npm run dev` 会同时启动：

- 前端（Vite）
- 本地排行榜服务（Node + SQLite，默认 `http://127.0.0.1:8787`）

也可以分别启动：

```bash
npm run dev:api
npm run dev:web
```

## 构建

```bash
npm run build
npm run preview
```

## 构建 Rust/WASM 包

```bash
npm run build:wasm
```

构建成功后，前端会自动优先加载 `src/engine/wasm/pkg` 下的 WASM 模块；
若模块不存在或加载失败，会自动回退 TS 引擎。

## 控制说明

- 方向：`A/D` 或 `←/→`
- 油门：`W` 或 `↑`
- 刹车：`S` 或 `↓`
- 漂移：`Shift`
- 氮气：`X` / `Ctrl`
- 使用道具：`Space`

## UI Style Guide

- 主题方向：街机霓虹（深海蓝底 + 青色主强调 + 橙红危险色）
- 布局规范：
  - 大厅态：左侧功能面板 + 右侧赛道预览
  - 比赛态：`body.race-mode` 开启后进入全屏沉浸 HUD，左侧面板隐藏
- HUD 信息层级：
  - 左上主块：速度（最大字号）
  - 上中：圈数/排名/进度/计时
  - 右上：氮气/热量/天气/道具
  - 底部条：任务 + 技巧 + 状态提示
- 新增 HUD 项目时优先放入上中或右上分组，避免覆盖赛道中心。
- 动效预算：性能优先，只使用轻量过渡，不使用大面积实时模糊与高强度发光。

## 排行榜配置（SQLite）

默认无需额外配置。启动 `npm run dev` 后，服务会自动：

- 创建 `data/leaderboard.sqlite`
- 自动初始化 `leaderboard_entries` 表

可选环境变量：

- `LEADERBOARD_HOST`（默认 `127.0.0.1`）
- `LEADERBOARD_PORT`（默认 `8787`）
- `VITE_LEADERBOARD_API_BASE`（前端手动指定 API 地址时使用，例如 preview 环境）

## Rust/WASM 路线说明

仓库已创建 Rust 引擎脚手架：`rust/qq_racer_engine`。

当前页面默认使用 TS fallback 引擎（`src/engine/ts/fallbackEngine.ts`），
等本地可用 `wasm-bindgen-cli/wasm-pack` 后，可接入 `src/engine/wasm/bridge` 切换到 Rust 运行时。

## 远程部署（腾讯云）

### 1) 首次部署（PM2 + Nginx）

```bash
sudo bash scripts/setup-car-game-pm2-tencent.sh \
  --domain your.domain.com \
  --project-dir /home/car-game \
  --run-user root \
  --signal-port 8787
```

### 2) 日常更新代码并重启服务

先在本机修改 `scripts/deploy-remote-build.sh` 顶部参数，然后执行：

```bash
bash scripts/deploy-remote-build.sh
```

该脚本会自动执行：

- 远程 `git pull`
- `npm install`（按需）
- `npm run build`
- 重启 `car-game` 进程
