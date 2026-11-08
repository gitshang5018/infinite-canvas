// 生成 Tauri 打包所需的全部图标。
// 优先使用桌面端构建好的高分辨率 PNG（或 SVG），由官方 tauri icon 命令统一产出
// PNG / ICNS / ICO 各平台格式，避免手工维护多套尺寸。
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectDir = join(here, "..");
const repoRoot = join(projectDir, "..");
const sourcePng = join(repoRoot, "desktop", "build", "icon.png");
const sourceSvg = join(repoRoot, "desktop", "assets", "icon.svg");
const sourceIcon = existsSync(sourcePng) ? sourcePng : sourceSvg;
const iconsDir = join(projectDir, "src-tauri", "icons");

mkdirSync(iconsDir, { recursive: true });

// 优先直接用 node 执行本地安装的 tauri CLI 入口；未安装本地依赖时降级到 npx。
const cli = join(projectDir, "node_modules", "@tauri-apps", "cli", "tauri.js");
if (existsSync(cli)) {
  execFileSync(process.execPath, [cli, "icon", sourceIcon, "--output", iconsDir], {
    stdio: "inherit",
    cwd: projectDir,
  });
} else {
  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(npxCmd, ["@tauri-apps/cli", "icon", sourceIcon, "--output", iconsDir], {
    stdio: "inherit",
    cwd: projectDir,
  });
}
