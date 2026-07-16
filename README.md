# LiteLoaderQQNT（macOS 优化 fork）

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Upstream](https://img.shields.io/badge/upstream-LiteLoaderQQNT-blue?logo=github)](https://github.com/LiteLoaderQQNT/LiteLoaderQQNT)

> 基于 [LiteLoaderQQNT](https://github.com/LiteLoaderQQNT/LiteLoaderQQNT) 的社区 fork，**优先打磨 macOS（App Sandbox）** 下的安装、路径与多进程稳定性。  
> 插件 API、`local://` 协议与上游保持兼容。

LiteLoaderQQNT（简称 LiteLoader）是 QQNT 的插件加载器，可为 QQ 增加主题、功能扩展等。上游官网：<https://liteloaderqqnt.github.io>。

<!-- prettier-ignore -->
> [!CAUTION]
> QQ 安全中心可能将 LiteLoader 视为「非法外挂」，导致设备下线或账号风险。**请自行评估后再使用。**  
> 本项目仅供学习与研究，使用后果自负。

## 本 fork 做了什么

在兼容上游插件生态的前提下，针对 **macOS 官方 QQ（沙盒版）** 做了入口与路径加固：

| 能力 | 说明 |
|------|------|
| 沙盒可读安装位 | 推荐把本体放在 QQ 容器目录内，避免 `EPERM` 读不到 `~/Developer` 等路径 |
| 显式入口 | `require(.../src/main.js)`，不再 `require(目录)` |
| fail-open | 加载失败时回退官方入口，尽量不把整个 QQ 打挂 |
| QQEX* 子进程 | `QQEXDOC` / `QQEXGuild` 等 helper **不注入** LiteLoader，只走主 QQ 的 stock 入口，消除弹窗 |
| 路径中心化 | `src/main/path.js`：`root` / `profile` / 主包 `Resources/app` 解析 |
| 安装脚本 | `scripts/install-macos.sh` 写入 `ml_install.js` 并备份 `package.json` |

上游 Windows / 通用文档仍以 [原仓库](https://github.com/LiteLoaderQQNT/LiteLoaderQQNT) 为准；本 README 以 **macOS** 为主。

## 致谢

本 fork 的分析、改造与排障离不开以下支持，**特别感谢**：

- **[Grok Build](https://x.ai)**（xAI）  
  在 macOS 沙盒、`resourcesPath` 多进程、入口 fail-open 与路径模型上的结对实现与调试。
- **[Linux.do](https://linux.do) 论坛**  
  社区里关于 **Vibe coding**（与 AI 结对编程、工作流与工程实践）的讨论与氛围，让这次改造能以更高效的方式推进。

同时感谢：

- **[LiteLoaderQQNT](https://github.com/LiteLoaderQQNT/LiteLoaderQQNT)** 原作者与维护者，以及全体插件开发者  
- 上游文档、Telegram 频道与插件列表的贡献者  

没有上游项目与社区，就不会有这个 fork。

## 风险与前置条件

1. **文件完整性**  
   修改 `package.json` 的 `main` 会触发 QQ 的完整性校验。你仍需要自行准备可用的绕过方案（例如社区常见的校验补丁；Windows 上还有 `dbghelp` 等方案，见上游说明）。  
   **本仓库不包含、也不分发任何校验绕过二进制。**

2. **账号与合规**  
   使用插件加载器可能违反 QQ 用户协议，存在封号 / 设备下线风险。

3. **版本**  
   在 macOS QQ `6.9.96` 一带验证过主路径与 QQEX helper；大版本升级后请重新检查入口与脚本。

## macOS 安装（推荐）

### 1. 准备 QQ

使用**未改 main 的官方包**（或你信任的干净安装），确认能正常启动。

可选：清除隔离属性

```bash
sudo xattr -cr /Applications/QQ.app
```

### 2. 放置 LiteLoader 本体（必须在沙盒内）

QQ 开启 App Sandbox 后，**不能**从 `~/Developer` 等容器外路径 `require` 本体（会 `EPERM`）。

推荐目录：

```text
~/Library/Containers/com.tencent.qq/Data/Documents/LiteLoaderQQNT
```

示例：把本仓库同步到该目录（保留已有 `plugins` / `data`）：

```bash
DEST="$HOME/Library/Containers/com.tencent.qq/Data/Documents/LiteLoaderQQNT"
mkdir -p "$DEST"
rsync -a --delete \
  --exclude '.git' --exclude 'reference' --exclude 'plugins' --exclude 'data' \
  ./ "$DEST/"
```

### 3. 注入入口

```bash
# 在本仓库根目录执行；第二个参数指向「沙盒内」本体路径
sudo ./scripts/install-macos.sh \
  /Applications/QQ.app \
  "$HOME/Library/Containers/com.tencent.qq/Data/Documents/LiteLoaderQQNT"
```

脚本会：

- 备份 `Resources/app/package.json` → `package.json.liteloader-backup`
- 写入 `Resources/app/app_launcher/ml_install.js`
- 将 `package.json` 的 `main` 设为 `./app_launcher/ml_install.js`

### 4. 配置完整性绕过

按你现有的、可用的方案处理（与上游社区一致）。未绕过时，改 `package.json` 后可能无法正常启动。

### 5. 验证

1. 完全退出 QQ 后重新打开。  
2. 打开 **设置**，侧栏出现 **LiteLoaderQQNT**。  
3. 终端启动时可看到加载相关日志；打开文档等能力时 **不应** 再弹出 `QQEXDOC...application.asar` 找不到模块。

## 路径与环境变量

| 变量 | 含义 |
|------|------|
| `LITELOADERQQNT_ROOT` | 框架代码根（含 `package.json` 与 `src/`） |
| `LITELOADERQQNT_PROFILE` | 可写数据根（其下为 `plugins/`、`data/`） |

未设置时：

- `root`：由入口钉死的路径，或自动探测  
- `profile`：优先沿用已有容器内数据目录；否则与 `root` 相同（与上游习惯兼容）

开发时在 git 仓库改代码后，再 `rsync` 到容器内路径即可，无需把 git 放进容器。

## 插件

- 设置页可安装 / 管理插件。  
- 手动：插件目录放到 `profile/plugins/<slug>/`，数据在 `profile/data/<slug>/`。  
- 寻找插件：上游官网、[插件列表](https://github.com/LiteLoaderQQNT/Plugin-List/blob/v4/plugins.json)、GitHub 搜索。

插件 `manifest` 与 `LiteLoader.api` / `local://root` · `local://profile` 与上游一致，原有插件一般可直接使用。

## 开发

- 插件开发文档见 [上游介绍](https://liteloaderqqnt.github.io/docs/introduction.html)。  
- 本 fork 关键改动文件：  
  - `src/main/path.js` — 路径解析  
  - `src/main/api.js` / `src/main.js` — 启动与协议  
  - `scripts/ml_install.template.js` / `scripts/install-macos.sh` — macOS 入口  

同步上游：

```bash
git fetch upstream
git merge upstream/main
```

## 与上游的关系

| | 上游 LiteLoaderQQNT | 本 fork |
|--|---------------------|---------|
| 定位 | 全平台插件加载器 | 同左 + **macOS 加固** |
| 安装文档 | Win / 通用为主 | **macOS 沙盒流程** 为主 |
| 插件协议 | manifest v4 等 | **兼容** |
| 维护 | 官方组织 | 社区 fork（[OiCkilL/LiteLoaderQQNT](https://github.com/OiCkilL/LiteLoaderQQNT)） |

欢迎把可合并的修复以 PR 形式回馈上游（若适用）。

## 许可证

与上游相同，采用 [MIT License](./LICENSE)。

再次感谢 **Grok Build**、**Linux.do** 与 **LiteLoaderQQNT** 社区。
