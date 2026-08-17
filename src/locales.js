export const NS = "dshmarketplace";

/**
 * Written in both languages rather than translated in one direction. The
 * catalogue itself is bilingual, so the shell around it has no excuse.
 */
export const en = {
  title: "DSH Marketplace",
  subtitle: "DeepSeek Harness plugins, one command away",
  search: "Search by capability, name or author…",
  empty: "Nothing matched. Try a capability — memory, vision, terminal.",
  loading: "Loading the catalogue…",
  error: "Could not reach the catalogue.",
  retry: "Retry",
  install: "Install",
  installing: "Installing…",
  installed: "Installed",
  failed: "Install failed",
  details: "Details",
  source: "Source",
  stars: "stars",
  registry: "In the community registry",
  topicOnly: "From the dsh-plugin topic",
  risk: "This plugin reaches:",
  riskNote:
    "Plugins run with your agent's permissions. Detection is heuristic — an empty list is not a clean bill of health.",
  confirm: "Install anyway",
  cancel: "Cancel",
  "settings.tab": "Plugin store",
  needsAllowBuilds:
    "This plugin installs from GitHub, and pnpm blocks a git-hosted package's build script until you allow it. Run the install once in a terminal — `dsh plugin --profile web add <source>` — and pnpm prints the exact key to add under `allowBuilds` in ~/.dsh/profiles/web/pnpm-workspace.yaml. Plugins published to npm install here without that step.",
};

export const zh = {
  title: "DSH Marketplace",
  subtitle: "DeepSeek Harness 插件，一行命令装好",
  search: "按能力、名称或作者搜索…",
  empty: "没有匹配的。换个能力试试——记忆、视觉、终端。",
  loading: "正在加载插件索引…",
  error: "连不上插件索引。",
  retry: "重试",
  install: "安装",
  installing: "正在安装…",
  installed: "已安装",
  failed: "安装失败",
  details: "详情",
  source: "源码",
  stars: "Star",
  registry: "已进入社区精选库",
  topicOnly: "来自 dsh-plugin topic",
  risk: "这个插件会碰到：",
  riskNote:
    "插件是带着你 agent 的权限在跑。识别是启发式的——没标不等于干净。",
  confirm: "仍然安装",
  cancel: "取消",
  "settings.tab": "插件市场",
  needsAllowBuilds:
    "这个插件从 GitHub 装，而 pnpm 默认不允许 git 来源的包跑构建脚本。在终端里手动跑一次 `dsh plugin --profile web add <来源>`，pnpm 会打印出需要加到 ~/.dsh/profiles/web/pnpm-workspace.yaml 里 `allowBuilds` 下的那个 key。发布到 npm 的插件不需要这一步。",
};
