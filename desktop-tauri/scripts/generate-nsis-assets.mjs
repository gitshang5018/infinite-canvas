// 生成 Windows NSIS 安装向导所需的自定义高品质位图（sidebarImage 和 headerImage）
// 替换掉 NSIS 默认复古的 90 年代老式蓝色电脑插图（modern-wizard.bmp）
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const projectDir = join(here, "..");
const repoRoot = join(projectDir, "..");
const require = createRequire(join(repoRoot, "desktop", "package.json"));
const { Resvg } = require("@resvg/resvg-js");
const tauriIconsDir = join(projectDir, "src-tauri", "icons");
const electronBuildDir = join(repoRoot, "desktop", "build");

mkdirSync(tauriIconsDir, { recursive: true });
mkdirSync(electronBuildDir, { recursive: true });

function rgbaToBmp(rgbaBuf, width, height) {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const imageSize = rowSize * height;
  const fileSize = 54 + imageSize;
  const buf = Buffer.alloc(fileSize);

  // BMP Header (14 bytes)
  buf.write("BM", 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(0, 6);
  buf.writeUInt32LE(54, 10);

  // DIB Header (40 bytes)
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(imageSize, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);
  buf.writeUInt32LE(0, 46);
  buf.writeUInt32LE(0, 50);

  let offset = 54;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const r = rgbaBuf[srcIdx];
      const g = rgbaBuf[srcIdx + 1];
      const b = rgbaBuf[srcIdx + 2];
      const a = rgbaBuf[srcIdx + 3] / 255;
      // Alpha 混合背景
      const finalR = Math.round(r * a + 255 * (1 - a));
      const finalG = Math.round(g * a + 255 * (1 - a));
      const finalB = Math.round(b * a + 255 * (1 - a));

      buf[offset++] = finalB;
      buf[offset++] = finalG;
      buf[offset++] = finalR;
    }
    const pad = rowSize - width * 3;
    for (let p = 0; p < pad; p++) {
      buf[offset++] = 0;
    }
  }
  return buf;
}

// 侧边栏大图：164 x 314 px，替换 NSIS 默认的 90 年代老电脑图
const sidebarSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314" viewBox="0 0 164 314">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#181615"/>
      <stop offset="50%" stop-color="#211d1a"/>
      <stop offset="100%" stop-color="#141211"/>
    </linearGradient>
    <radialGradient id="centerGlow" cx="50%" cy="32%" r="45%">
      <stop offset="0%" stop-color="#3a332d" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#181615" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- 背景底色与微光 -->
  <rect width="164" height="314" fill="url(#bg)"/>
  <rect width="164" height="314" fill="url(#centerGlow)"/>

  <!-- 画布网格参考线 -->
  <g stroke="#332d28" stroke-width="0.75" stroke-dasharray="2,3" opacity="0.35">
    <line x1="20" y1="0" x2="20" y2="314"/>
    <line x1="50" y1="0" x2="50" y2="314"/>
    <line x1="82" y1="0" x2="82" y2="314"/>
    <line x1="114" y1="0" x2="114" y2="314"/>
    <line x1="144" y1="0" x2="144" y2="314"/>
    <line x1="0" y1="40" x2="164" y2="40"/>
    <line x1="0" y1="100" x2="164" y2="100"/>
    <line x1="0" y1="160" x2="164" y2="160"/>
    <line x1="0" y1="220" x2="164" y2="220"/>
    <line x1="0" y1="280" x2="164" y2="280"/>
  </g>

  <!-- 品牌 Logo 容器 -->
  <g transform="translate(48, 56)">
    <rect width="68" height="68" rx="18" fill="#26221f" stroke="#3d3732" stroke-width="1.5"/>
    <g transform="translate(10, 10) scale(0.75)" fill="#fafaf9">
      <path d="M32 8L58 54H46L32 29L18 54H6L32 8Z"/>
      <path d="M32 40L40 54H24L32 40Z"/>
    </g>
  </g>

  <!-- 标题与英文字样 -->
  <text x="82" y="165" font-family="'Microsoft YaHei', 'PingFang SC', sans-serif" font-size="18" font-weight="700" fill="#f5f5f4" text-anchor="middle" letter-spacing="1">无限画布</text>
  <text x="82" y="185" font-family="'Segoe UI', sans-serif" font-size="10" font-weight="500" fill="#a8a29e" text-anchor="middle" letter-spacing="1.5">INFINITE CANVAS</text>

  <!-- 分割线与装饰 -->
  <line x1="52" y1="205" x2="112" y2="205" stroke="#3d3732" stroke-width="1"/>

  <text x="82" y="228" font-family="'Microsoft YaHei', 'PingFang SC', sans-serif" font-size="10" fill="#78716c" text-anchor="middle">AI 自由创意工作台</text>
  <text x="82" y="295" font-family="'Segoe UI', sans-serif" font-size="9" fill="#57534e" text-anchor="middle">v0.20.0</text>
</svg>`;

// 顶栏图标：150 x 57 px，纯白底色无缝融入向导顶部
const headerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57" viewBox="0 0 150 57">
  <rect width="150" height="57" fill="#ffffff"/>
  <g transform="translate(98, 6.5)">
    <rect width="44" height="44" rx="10" fill="#1c1917"/>
    <g transform="translate(6, 6) scale(0.5)" fill="#fafaf9">
      <path d="M32 8L58 54H46L32 29L18 54H6L32 8Z"/>
      <path d="M32 40L40 54H24L32 40Z"/>
    </g>
  </g>
</svg>`;

const sidebarRen = new Resvg(sidebarSvg).render();
const sidebarBmp = rgbaToBmp(sidebarRen.pixels, 164, 314);

const headerRen = new Resvg(headerSvg).render();
const headerBmp = rgbaToBmp(headerRen.pixels, 150, 57);

// 写入 Tauri 目录
writeFileSync(join(tauriIconsDir, "installer-sidebar.bmp"), sidebarBmp);
writeFileSync(join(tauriIconsDir, "installer-header.bmp"), headerBmp);

// 写入 Electron 目录
writeFileSync(join(electronBuildDir, "installerSidebar.bmp"), sidebarBmp);
writeFileSync(join(electronBuildDir, "installerHeader.bmp"), headerBmp);

console.log(`生成完成:
  installer-sidebar.bmp (${sidebarBmp.length} 字节)
  installer-header.bmp  (${headerBmp.length} 字节)`);
