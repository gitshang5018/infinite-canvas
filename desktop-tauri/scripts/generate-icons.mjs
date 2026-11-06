// 生成 Tauri 打包所需的全部图标。
// 源图复用桌面端已有的 SVG，由官方 tauri icon 命令统一产出
// PNG / ICNS / ICO 各平台格式，避免手工维护多套尺寸。
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectDir = join(here, "..");
const repoRoot = join(projectDir, "..");
const sourceSvg = join(repoRoot, "desktop", "assets", "icon.svg");
const iconsDir = join(projectDir, "src-tauri", "icons");

mkdirSync(iconsDir, { recursive: true });

// 直接用 node 执行本地安装的 tauri CLI 入口，避开 npx 在各平台下的启动差异。
const cli = join(projectDir, "node_modules", "@tauri-apps", "cli", "tauri.js");
if (!existsSync(cli)) {
    throw new Error(`未找到 Tauri CLI，请先在 ${projectDir} 执行 npm install`);
}
execFileSync(process.execPath, [cli, "icon", sourceSvg, "--output", iconsDir], {
    stdio: "inherit",
    cwd: projectDir,
});
