# Skill TUI — 实施规划

> 一个用 TypeScript 编写的终端 UI 工具：输入 Skill 仓库的 Git 地址，浏览仓库内的 Skill，选择目标 Agent（Claude Code / Codex / Cursor / ZCode / Gemini / OpenCode），一键导入到对应 Agent 的 Skill 目录。

---

## 1. 项目概述

**问题**：Skill（以 `SKILL.md` 为入口的目录）正在成为各 AI 编码 Agent 的通用能力格式，但各 Agent 的安装位置不同，手动 `git clone` 再拷贝既繁琐又容易出错。

**目标**：做一个好看的 TUI，把"克隆仓库 → 发现 Skill → 选择目标 Agent → 导入"这整条链路打包成一个交互式流程。

**核心体验**：
- 启动时显示仿 opencode TUI 的块状标题（居中、双色、半块像素风）。
- 输入 Git 地址 → 自动克隆到本地缓存 → 扫描出所有 Skill。
- 多选 Skill → 多选目标 Agent → 导入并展示结果。

---

## 2. 调研结论

### 2.1 各 Agent 的 Skill 系统路径与格式（已核实）

统一的 Skill 格式：**目录内放一个 `SKILL.md`**，文件头为 YAML frontmatter：

```markdown
---
name: my-skill
description: 做什么 + 什么时候用（这是各 Agent 自动触发的路由依据）
---
# 正文（< 500 行为佳）
...
```

各 Agent 的安装位置：

| Agent | 全局 Skill 目录 | 级别 | 备注 |
|---|---|---|---|
| **Claude Code** | `~/.claude/skills/<name>/SKILL.md` | 个人级 | 目录名 = `/命令名`；frontmatter `name` 仅显示用 |
| **Codex** | `~/.codex/skills/<name>/SKILL.md` | 用户级 | 同格式；系统 Skill 在 `.system/` 子目录 |
| **Cursor** | `~/.cursor/skills/<name>/SKILL.md` | 全局 | 新版用 `skills/`；旧规则用 `.cursor/rules/*.mdc` |
| **ZCode** | `~/.zcode/skills/<name>/SKILL.md` | 用户级 | 常以 symlink 指向 codex/claude 的同名 Skill |
| **Gemini CLI** | `~/.gemini/skills/<name>/SKILL.md` + 在 `~/.gemini/GEMINI.md` 追加 `@./skills/<name>/SKILL.md` | 全局 | 通过 `GEMINI.md` 的 `@` 导入语句接入 |
| **OpenCode** | `~/.config/opencode/skills/<name>/SKILL.md`（或写入 `opencode.json` 的 `skills.paths`） | 全局 | 旧版用 symlink 指向 plugins 目录 |

**关键结论**：
- Claude Code / Codex / Cursor / ZCode 四家**完全一致**：把 Skill 目录拷到 `<config>/skills/<name>/` 即可，零额外接线。这四家是 **Tier-1 目标**，实现最稳。
- Gemini / OpenCode 需要"接线"（`@`-import / 配置写入），是 **Tier-2 目标**，机制有据但实现时需再次验证。
- 导入时**目录名即命令名**（Claude Code / Codex 均如此），所以目标路径里的 `<name>` 取 Skill 目录名，而非 frontmatter 的 `name`。

**Agent 安装探测**：仅判断配置目录存在不够（用户可能手动建过空目录）。采用**三态探测**，每 Agent 同时检查「可执行文件是否在 PATH」+「配置目录是否存在」：

| 状态 | 含义 | 显示 |
|---|---|---|
| `installed` | 可执行文件在 PATH | `✓ 已安装`（success） |
| `configured` | 仅配置目录存在、无可执行 | `⚠ 检测到配置`（warning） |
| `missing` | 两者皆无 | `✗ 未检测`（danger） |

各 Agent 可执行名：`claude`、`codex`、`zcode`、`gemini`、`opencode`、`cursor`（Cursor 为 GUI 应用，`cursor` CLI 不一定在 PATH——对 Cursor 以配置目录为主信号，可执行为辅）。探测用 `which`/`where`（跨平台）。`configured`/`missing` 仍可选，但 warning 提示。

### 2.2 仓库形态识别

一个 Skill 仓库可能是：
1. **多 Skill 仓库**：根目录有 `skills/`，里面每个子目录是一个 Skill（如 `superpowers` 仓库）。
2. **单 Skill 仓库**：根目录直接是 `SKILL.md`（仓库本身就是一个 Skill）。
3. **插件仓库**：带 `.claude-plugin/plugin.json` / `.codex-plugin/plugin.json` / `.cursor-plugin/plugin.json` / `gemini-extension.json` 等清单，内部仍以 `skills/<name>/SKILL.md` 组织。

发现逻辑（按优先级）：
1. 找 `skills/` 子目录 → 列出其下所有含 `SKILL.md` 的子目录。
2. 否则若根目录有 `SKILL.md` → 整个仓库是单个 Skill。
3. 否则递归搜索所有 `SKILL.md`（兜底）。

### 2.3 opencode TUI 标题风格分析（已读源码）

opencode 的 logo（`packages/tui/src/logo.ts` + `component/logo.tsx`）：
- 用 ASCII 半块字符（`█` `▀` `▄` + 空格）拼出 "OPENCODE"，3 行高。
- **左右双色**：左半 `theme.textMuted`（非粗体），右半 `theme.text`（粗体）。
- 用 25% 阴影色 `tint(background, fg, 0.25)` 给部分像素做底色。
- Home 布局：上下弹性留白把内容垂直居中，logo 在上、输入框在下，左右 padding=2，输入框最大宽 75 列。

**本项目的复刻方案**：
- 用 `figlet` 的 **ANSI Shadow** 字体渲染 `SKILL TUI`（已验证输出见下），得到干净的 `█` 块状像素风，与 opencode 同源观感。
- 沿用**左右双色**：标题左半 muted 色，右半 主题强调色 + 粗体。
- 沿用**居中 + 上弹性留白**的 Home 布局，logo 在上、输入框在下。
- 副标题一行 dim 文案：`Skill installer for Claude Code · Codex · Cursor · ZCode · Gemini · OpenCode`。

`figlet "SKILL TUI" -f "ANSI Shadow"` 实测输出（标题样稿）：

```
███████╗██╗  ██╗██╗██╗     ██╗         ████████╗██╗   ██╗██╗
██╔════╝██║ ██╔╝██║██║     ██║         ╚══██╔══╝██║   ██║██║
███████╗█████╔╝ ██║██║     ██║            ██║   ██║   ██║██║
╚════██║██╔═██╗ ██║██║     ██║            ██║   ██║   ██║██║
███████║██║  ██╗██║███████╗███████╗       ██║   ╚██████╔╝██║
╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝       ╚═╝    ╚═════╝ ╚═╝
```

### 2.4 TUI 框架选型

**选定 [Ink](https://github.com/vadimdemedes/ink)**（React 渲染器 + Yoga Flexbox 布局）。
- TypeScript 一等公民；Claude Code / Gemini CLI / Copilot CLI 都用它。
- `<Box>` + `<Text>` 即可做出 Flexbox 布局、边框、居中；`useInput` 处理键盘。
- 配套组件：`ink-text-input`、`ink-select-input`、`ink-spinner`；多选用自实现勾选列表（更可控）。
- 备选 blessed/neo-blessed（widget 多但年久失修）、terminal-kit（命令式）。Ink 在维护性、可测试性、TS 体验上最优。

---

## 3. 技术栈

| 用途 | 选型 |
|---|---|
| 语言 | TypeScript（strict） |
| TUI 框架 | `ink` + `react` |
| 运行/构建 | `tsx`（开发直跑）、`tsup`（打包成单文件 CLI） |
| Git 克隆 | `simple-git`（或直接 spawn `git`，更少依赖、更可控） |
| Frontmatter 解析 | `gray-matter`（成熟、带验证） |
| ASCII 标题 | `figlet`（ANSI Shadow 字体） |
| 配色 | `chalk`（Ink 自带） |
| 文件操作 | Node `fs/promises` |
| 路径 | `os.homedir()` + 跨平台拼接 |
| 测试 | `ink-testing-library` + `vitest` |
| CLI 解析 | 轻量自写（或 `meow`），支持 `skill-tui [git-url]` 直进、`--dry-run` 预览不写入、`--overwrite` 覆盖已有、`--no-backup` 跳过备份 |

Node 版本：`>= 20`。

**npm 包名与命令名**：已核实 `skill-tui` 在 npm registry 未被占用，作为发布包名。终端命令名用 `skill`（已核实 PATH 上未占用）——npm 支持包名与 bin 命令名不同。用户安装：`npm i -g skill-tui`，启动：终端输入 `skill`。（备选包名 `skilltui` / `@skill/cli` 同样可用。）

---

## 4. UI / UX 设计

### 4.1 配色（Theme）

仿 opencode 的暗色主题，定义在 `src/theme.ts`：

| token | 颜色 | 用途 |
|---|---|---|
| `background` | `#0d1117`（GitHub dark） | 主背景 |
| `panel` | `#161b22` | 面板/输入框底 |
| `text` | `#e6edf3` | 主文字 |
| `textMuted` | `#7d8590` | 次要文字、标题左半 |
| `accent` | `#2f81f7`（蓝） | 标题右半、选中高亮、强调 |
| `accentDim` | `#1f6feb` | 次强调 |
| `success` | `#3fb950`（绿） | 成功、已勾选 |
| `warning` | `#d29922` | 警告、已存在 |
| `danger` | `#f85149` | 错误 |
| `border` | `#30363d` | 边框 |

### 4.2 屏幕流程（状态机）

```
[Welcome/URL输入] --Enter--> [克隆中] --成功--> [Skill列表(多选)]
       ^                        |                    |
       |                     失败                   Enter
       +--------Esc返回---------+                    |
                                                 [Agent选择(多选)]
                                                       | Enter
                                              [导入预览(确认)]
                                                       | Enter确认 / dry-run止步
                                              [导入中(进度+备份)]
                                                       |
                                              [结果汇总]
                                              ├─ 再导一次 → URL输入
                                              └─ 退出
```

**安全门**：`Agent选择 → 导入预览` 是硬性确认关。预览屏列出"将要写入的每条路径 + 已存在项的处理方式（跳过/覆盖并备份）"，用户 Enter 才真正写入。`--dry-run` 模式下停在预览屏、按 Enter 后只打印计划不落盘即退出。

### 4.3 各屏幕线框图

**① Welcome / URL 输入（Home）**

```
        ╭──────────────────────────────────────────────────────────╮
        │  ███████╗██╗  ██╗██╗██╗     ██╗   ████████╗██╗   ██╗██╗ │  ← 左半 muted
        │  ██╔════╝██║ ██╔╝██║██║     ██║   ╚══██╔══╝██║   ██║██║ │  ← 右半 accent+bold
        │  ███████╗█████╔╝ ██║██║     ██║      ██║   ██║   ██║██║ │
        │  ╚════██║██╔═██╗ ██║██║     ██║      ██║   ██║   ██║██║ │
        │  ███████║██║  ██╗██║███████╗███████╗  ██║   ╚██████╔╝██║ │
        │  ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝  ╚═╝    ╚═════╝ ╚═╝ │
        │       Skill installer for Claude Code · Codex · …        │  ← dim 副标题
        ╰──────────────────────────────────────────────────────────╯

                       输入 Skill 仓库的 Git 地址

                  ┌─ https://github.com/user/skills.git ─┐
                  └──────────────────────────────────────┘

                  Enter 确认    Esc 退出    ↑↓ 历史记录
```

- 输入框带 `panel` 底色 + `border` 边框，光标高亮。
- 维护一个本地历史记录（`~/.skill-tui/history.json`），↑↓ 翻阅。
- 支持 `skill-tui <url>` 命令行参数直达，跳过手动输入。

**② 克隆中**

```
            ⠋ 正在克隆 https://github.com/user/skills.git …

            目标缓存: ~/.skill-tui/cache/<repo-hash>/
```

- `ink-spinner` 转圈，dim 进度文案。
- 已缓存则秒过（显示 "使用缓存"）。

**③ Skill 列表（多选）**

```
  ┌ 发现 4 个 Skill ──────────────────────────────────────────────┐
  │                                                              │
  │  ◉  code-review        审查未提交改动并标红风险               │
  │  ◉  deploy-staging     一键部署到 staging 环境               │
  │  ◯  markitdown         把文档/图片/音频转成 Markdown          │
  │  ◯  pdf                处理 PDF 抽取与生成                   │
  │                                                              │
  ├──────────────────────────────────────────────────────────────┤
  │  ↑↓ 移动   Space 勾选   a 全选/全不选   Enter 下一步   Esc 返回 │
  └──────────────────────────────────────────────────────────────┘
```

- `◉` 已选（success 色）/ `◯` 未选（muted）。
- 名称用 `text` 色，描述用 `textMuted`，可截断省略号。
- 顶部计数，底部操作提示栏。

**④ Agent 选择（多选）**

```
  ┌ 选择目标 Agent ──────────────────────────────────────────────┐
  │                                                              │
  │  ◉  Claude Code    ✓ 已安装    → ~/.claude/skills/            │
  │  ◉  Codex          ✓ 已安装    → ~/.codex/skills/             │
  │  ◯  Cursor         ⚠ 仅配置    → ~/.cursor/skills/            │
  │  ◯  ZCode          ✓ 已安装    → ~/.zcode/skills/             │
  │  ◯  Gemini CLI     ✓ 已安装    → ~/.gemini/skills/ (+GEMINI.md)│
  │  ◯  OpenCode       ✗ 未检测    → ~/.config/opencode/skills/   │
  │                                                              │
  ├──────────────────────────────────────────────────────────────┤
  │  ↑↓ 移动   Space 勾选   Enter 下一步(预览)   Esc 返回          │
  └──────────────────────────────────────────────────────────────┘
```

- **三态探测**：`✓ 已安装`（可执行在 PATH，success）/ `⚠ 仅配置`（配置目录存在但无可执行，warning）/ `✗ 未检测`（两者皆无，danger）。
- `⚠`/`✗` 仍可选（导出后由用户自行安装 Agent），但用 warning/danger 色提示。
- 每行右侧预览目标路径。

**⑤ 导入预览（确认关）**

```
  ┌ 导入预览 — 确认后将写入以下路径 ─────────────────────────────┐
  │                                                            │
  │  将安装 6 项：                                             │
  │                                                            │
  │  Claude Code                                              │
  │    + code-review        → ~/.claude/skills/code-review/    │
  │    + deploy-staging     → ~/.claude/skills/deploy-staging/ │
  │    ◷ markitdown (已存在) → 跳过            [overwrite→备份] │
  │  Codex                                                    │
  │    + code-review        → ~/.codex/skills/code-review/     │
  │    + deploy-staging     → ~/.codex/skills/deploy-staging/  │
  │    + markitdown         → ~/.codex/skills/markitdown/      │
  │                                                            │
  │  已存在处理：跳过（默认）    o 切换为「覆盖+备份」           │
  ├────────────────────────────────────────────────────────────┤
  │  Enter 确认导入    o 切换覆盖模式    Esc 返回    q 取消       │
  └────────────────────────────────────────────────────────────┘
```

- `+` 新增、`◷` 已存在（warning）。默认**跳过**已存在项；按 `o` 切换为「覆盖+备份」：覆盖前先把旧目录拷到 `~/.skill-tui/backup/<agent>/<name>/<时间戳>/`。
- `--dry-run` 模式：Enter 后只打印上述计划、不落盘、退出。
- 这是误操作的最后一道防线——明确列出每条目标路径与处置。

**⑥ 导入中（进度+备份）**

```
  导入中…

  [████████████░░░░░░░░] 60%   code-review → Claude Code
  [████████░░░░░░░░░░░░] 40%   deploy-staging → Codex
  ✓ markitdown → Claude Code
  ✓ markitdown → Codex
```

- 每个 (Skill × Agent) 任务一行；进行中显示进度条，完成打 ✓（success），失败打 ✗（danger）+ 简短原因。
- 覆盖项先备份到 `~/.skill-tui/backup/<agent>/<name>/<时间戳>/` 再写入，结果行标注 `↻ 已备份`。
- 并发受控（默认 4）避免磁盘抖动。

**⑦ 结果汇总**

```
  ┌ 导入完成 ────────────────────────────────────────────────────┐
  │                                                            │
  │  ✓ 3 个 Skill → 2 个 Agent（共 6 次安装）                  │
  │                                                            │
  │  Claude Code  ~/.claude/skills/code-review/                │
  │               ~/.claude/skills/deploy-staging/             │
  │               ~/.claude/skills/markitdown/                 │
  │  Codex        ~/.codex/skills/code-review/                 │
  │               …                                            │
  │                                                            │
  │  ⚠ 1 个跳过：pdf 已存在（未覆盖）                           │
  │  ↻ 1 个备份：markitdown → ~/.skill-tui/backup/claude/…/     │
  │                                                            │
  ├────────────────────────────────────────────────────────────┤
  │  r 再导一次    o 打开安装目录    b 恢复备份    q 退出          │
  └────────────────────────────────────────────────────────────┘
```

- `b 恢复备份`：列出最近备份，选择后还原回 Agent 目录（误操作回退手段）。

---

## 5. 项目结构

```
skill-tui/
├── package.json
├── tsconfig.json
├── tsup.config.ts            # 打包配置
├── README.md
├── plan.md                   # 本文件
├── src/
│   ├── index.tsx             # 入口：解析参数 → render(<App/>)
│   ├── app.tsx               # 顶层状态机，按 screen 切换
│   ├── theme.ts              # 配色 token
│   ├── logo.tsx              # figlet 渲染 + 双色着色
│   ├── components/
│   │   ├── title.tsx         # 标题区（logo + 副标题，居中）
│   │   ├── url-input.tsx     # 屏幕①：Git 地址输入
│   │   ├── cloning.tsx       # 屏幕②：克隆中 spinner
│   │   ├── skill-list.tsx    # 屏幕③：Skill 多选列表
│   │   ├── agent-select.tsx  # 屏幕④：Agent 多选（三态探测）
│   │   ├── preview.tsx       # 屏幕⑤：导入预览/确认关（含覆盖切换）
│   │   ├── importing.tsx     # 屏幕⑥：导入进度+备份
│   │   ├── result.tsx        # 屏幕⑦：结果汇总（含恢复备份）
│   │   ├── checkbox-list.tsx # 通用勾选列表组件（复用）
│   │   ├── progress-bar.tsx  # 进度条组件
│   │   ├── spinner.tsx       # spinner 封装
│   │   └── footer-hint.tsx   # 底部操作提示栏
│   ├── core/
│   │   ├── repo.ts           # 克隆/更新/缓存 git 仓库
│   │   ├── discover.ts       # 扫描仓库，发现 Skill
│   │   ├── frontmatter.ts    # 解析 SKILL.md frontmatter
│   │   ├── agents.ts         # Agent 注册表 + 三态安装探测（exe+配置目录）
│   │   ├── importer.ts       # 拷贝 Skill 到目标目录（含 Gemini/OpenCode 接线）
│   │   ├── backup.ts         # 覆盖前备份 + 恢复（~/.skill-tui/backup/）
│   │   ├── detect.ts         # 可执行文件 PATH 探测（which/where 跨平台）
│   │   ├── history.ts        # URL 历史记录读写
│   │   └── paths.ts          # 跨平台家目录与缓存路径
│   └── types.ts              # 共享类型
└── tests/
    ├── discover.test.ts
    ├── frontmatter.test.ts
    ├── importer.test.ts
    └── agents.test.ts
```

---

## 6. 核心逻辑设计

### 6.1 仓库克隆与缓存（`core/repo.ts`）

- 缓存根目录：`~/.skill-tui/cache/<sha256(url)[0:12]>/`。
- 若已存在 → `git pull --ff-only` 更新；失败则删除重克隆。
- 克隆用 `git clone --depth 1 <url> <dest>`（浅克隆，快）。
- 返回本地工作目录路径。
- 失败抛带友好信息的错误（区分：无 git、无网络、URL 无效、仓库为空）。

### 6.2 Skill 发现（`core/discover.ts`）

```ts
interface DiscoveredSkill {
  id: string;            // 仓库内相对路径，唯一
  name: string;          // 目录名（= 命令名）
  dir: string;           // 本地绝对路径
  description: string;   // frontmatter.description，缺省取正文首段
  relativePath: string;  // 相对仓库根
}
```

发现顺序（见 §2.2）：`skills/*/SKILL.md` → 根 `SKILL.md` → 递归兜底。
用 `gray-matter` 解析 frontmatter，`name` 缺省回退目录名，`description` 缺省回退正文首行。

### 6.3 Agent 注册表（`core/agents.ts`）

```ts
type AgentStatus = 'installed' | 'configured' | 'missing';

interface Agent {
  id: string;            // 'claude' | 'codex' | 'cursor' | 'zcode' | 'gemini' | 'opencode'
  label: string;         // 'Claude Code'
  exe: string;           // 可执行名，如 'claude'（Cursor 可为空，以配置目录为主）
  skillsDir: string;     // 绝对路径
  status: AgentStatus;   // installed=exe在PATH; configured=仅配置目录; missing=皆无
  import(skill, opts): Promise<ImportResult>;  // 各 Agent 各自实现
  icon?: string;         // 显示用
}
```

| id | skillsDir | 导入方式 |
|---|---|---|
| claude | `~/.claude/skills` | 拷贝 `<skill>/` → `~/.claude/skills/<name>/` |
| codex | `~/.codex/skills` | 同上 |
| cursor | `~/.cursor/skills` | 同上（探测以配置目录为主信号） |
| zcode | `~/.zcode/skills` | 同上 |
| gemini | `~/.gemini/skills` | 拷贝 + 在 `~/.gemini/GEMINI.md` 追加 `@./skills/<name>/SKILL.md`（去重） |
| opencode | `~/.config/opencode/skills` | 拷贝 + 可选写入 `opencode.json` 的 `skills.paths` |

### 6.4 导入器（`core/importer.ts`）

- 默认 **copy** 模式：递归拷贝整个 Skill 目录（含 `SKILL.md` 及 `scripts/`、`references/` 等附属文件），跳过 `.git`。
- 目标目录已存在时按 `overwrite` 策略处理：`skip`（默认）/ `overwrite`（先备份再覆盖）/ `rename`（加 `-2` 后缀）。结果里记录每项的处理方式。
- **备份机制**（`core/backup.ts`）：`overwrite` 模式下，写入前把旧目录拷到 `~/.skill-tui/backup/<agent>/<name>/<YYYYMMDD-HHMMSS>/`，并在 `~/.skill-tui/backup/index.json` 记录元数据（源路径、时间、关联任务）。结果屏 `b` 可列出并恢复。`--no-backup` 关闭（此时 overwrite 不留后路，需在预览屏二次确认）。
- **预览先行**：实际拷贝前由 `preview.tsx` 汇总每个 (Skill×Agent) 的目标路径与"已存在/新增"状态供用户确认；`importer` 提供 `plan(tasks)` 方法返回该清单（dry-run 复用同一逻辑，只 plan 不 act）。
- Tier-2 接线：
  - **Gemini**：读取 `~/.gemini/GEMINI.md`（不存在则创建），若不含对应 `@./skills/<name>/SKILL.md` 行则追加。
  - **OpenCode**：拷贝即可；写入 `opencode.json` 作为增强（可选，避免破坏用户配置）。
- 导入前后做轻量校验：目标 `SKILL.md` 存在且 frontmatter 可解析。

### 6.5 状态机（`app.tsx`）

```ts
type Screen =
  | { kind: 'url' }
  | { kind: 'cloning'; url: string }
  | { kind: 'skills'; repoDir: string; url: string }
  | { kind: 'agents'; repoDir: string; url: string; selected: string[] }
  | { kind: 'preview'; tasks: ImportTask[]; overwrite: boolean; dryRun: boolean }
  | { kind: 'importing'; tasks: ImportTask[]; overwrite: boolean }
  | { kind: 'result'; summary: ImportSummary };
```

各屏幕组件接收 `screen` 与回调（`onNext` / `onBack`），状态集中在 `app.tsx`。`preview` 屏的 `onNext` 携带最终 `overwrite` 选择进入 `importing`；`dryRun` 为真时 `onNext` 直接进 `result`（仅展示计划，未落盘）。

---

## 7. 关键类型定义（`src/types.ts`）

```ts
export interface Skill {
  id: string; name: string; dir: string;
  description: string; relativePath: string;
}
export type AgentId = 'claude'|'codex'|'cursor'|'zcode'|'gemini'|'opencode';
export type AgentStatus = 'installed'|'configured'|'missing';
export type OverwriteMode = 'skip'|'overwrite'|'rename';
export interface ImportTask { skill: Skill; agent: AgentId; }
export type TaskStatus = 'pending'|'running'|'done'|'failed'|'skipped';
export interface PlanItem {
  skill: Skill; agent: AgentId; targetPath: string;
  exists: boolean;             // 目标是否已存在
  action: OverwriteMode;       // 预计处置
  backupPath?: string;         // 覆盖时的备份目标
}
export interface ImportResult {
  status: TaskStatus; targetPath: string;
  action: OverwriteMode; backupPath?: string;
  message?: string;            // 失败原因 / 跳过原因
}
```

---

## 8. 实施阶段

### Phase 0 — 脚手架（0.5 天）
- `package.json`、`tsconfig.json`、`tsup.config.ts`。
- 依赖安装；`src/index.tsx` 跑通最小 Ink 渲染（"Hello"）。
- `theme.ts`、`logo.tsx`（figlet + 双色）落地，先在 Welcome 屏看到标题。

### Phase 1 — 标题与 Home 输入（0.5 天）
- `components/title.tsx`：居中、双色、副标题。
- `components/url-input.tsx`：`ink-text-input` + 边框 + 历史（`core/history.ts`）。
- 键盘：Enter / Esc / ↑↓。

### Phase 2 — 克隆与发现（1 天）
- `core/repo.ts`：克隆/缓存/pull。
- `core/discover.ts` + `core/frontmatter.ts`：扫描 + 解析。
- `components/cloning.tsx`：spinner。
- 单测 `discover` / `frontmatter`。

### Phase 3 — 选择交互（1 天）
- `components/checkbox-list.tsx`：通用多选（Space 勾选、a 全选、↑↓、Enter、Esc）。
- `components/skill-list.tsx`、`components/agent-select.tsx`：基于通用组件。
- `core/agents.ts`：注册表 + 探测安装。

### Phase 4 — 预览、导入与结果（1.5 天）
- `core/detect.ts`：跨平台 `which`/`where` 探测可执行。
- `core/backup.ts`：覆盖前备份 + index.json + 恢复。
- `core/importer.ts`：copy + `plan()` 预览清单 + Gemini/OpenCode 接线 + 覆盖策略。
- `components/preview.tsx`：确认关（路径清单 + 覆盖切换 + dry-run）。
- `components/importing.tsx`：并发执行 + 进度条 + 备份标注。
- `components/result.tsx`：汇总 + r/o/b/q 操作（b 恢复备份）。

### Phase 5 — 打磨与发布（0.5 天）
- 错误边界、Ctrl+C 清理、Windows 路径兼容。
- `tsup` 打包；`bin` 字段；README。
- 端到端跑一遍真实仓库（如 `superpowers`）。

**预估总工期：约 5 天。**

---

## 9. 边界情况与错误处理

| 情况 | 处理 |
|---|---|
| 无 `git` 可执行 | 启动时探测，给安装提示并退出 |
| URL 无效 / 仓库不存在 / 无网络 | 克隆屏显示 danger 错误，Esc 返回重输 |
| 仓库无任何 `SKILL.md` | Skill 列表屏空状态："未发现 Skill，Esc 返回" |
| frontmatter 缺 `name`/`description` | 回退目录名 / 正文首段，不报错 |
| 目标目录已存在 | 默认 skip 并在结果里 warning；可选 overwrite（先备份再覆盖）；预览屏明确标注处置 |
| `--dry-run` | 停在预览屏，Enter 后只打印计划不落盘即退出 |
| `--no-backup` + overwrite | 预览屏对 overwrite+无备份组合做二次确认（无回退手段） |
| 误操作回退 | 结果屏 `b` 列出 `~/.skill-tui/backup/` 备份并还原 |
| Agent 未安装 | Agent 列表三态标记，`⚠`/`✗` 可选但 warning 提示 |
| 权限不足 / 磁盘满 | 单任务标 failed + 原因，不中断其他任务 |
| Windows 路径 / symlink | v1 仅 copy，不做 symlink（Windows 需开发者模式） |
| Ctrl+C | `useApp().exit()`，清理临时克隆 |
| 终端过窄 | 标题/列表自适应截断，最小宽度提示 |

---

## 10. 未来扩展（v2+）

- **symlink 模式**：与源仓库保持同步（ZCode 风格）。
- **插件仓库整包导入**：识别 `.claude-plugin` 等清单，按 Agent 原生插件机制安装而非散拷。
- **更新/卸载**：列出已导入 Skill，一键更新或移除。
- **市场浏览**：内置若干已知 Skill 仓库列表，免输 URL。
- **校验**：导入后按各 Agent frontmatter 规则校验（如 Claude Code 的 `name` 命名约束、`description` 长度）。
- **主题切换**：跟随终端配色 / 提供 light 主题。

---

## 11. 待实现时再次确认的点

1. **Gemini** 的 `~/.gemini/GEMINI.md` 是否一定被全局加载、`@./skills/<n>/SKILL.md` 相对路径解析基准（应相对 `~/.gemini/`）。实现前用真实 Gemini CLI 验证一次。
2. **OpenCode** `opencode.json` 的 `skills.paths` 字段确切写法（避免破坏用户既有配置，默认只拷贝、不写配置）。
3. **Cursor** 新版 `~/.cursor/skills/` 是否与 `~/.cursor/rules/*.mdc` 并存且都被识别；以实际 Cursor 版本为准。

以上三点不阻塞 Tier-1（Claude Code / Codex / Cursor / ZCode 的纯拷贝路径已核实可用）。
