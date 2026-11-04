// 把 Web 前端产物打包成桌面客户端资源：
// 1) 复制 web/dist 到 desktop/resources/web；
// 2) 用 esbuild 把 canvas-proxy 打成 CommonJS，桌面端可直接以子进程方式启动；
// 3) 渲染应用图标，供 electron-builder 生成各平台安装包。
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { Resvg } from "@resvg/resvg-js";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = path.resolve(desktopDir, "..");
const resourcesDir = path.join(desktopDir, "resources");
const buildDir = path.join(desktopDir, "build");

const webDist = path.join(repoDir, "web", "dist");
const proxyDir = path.join(repoDir, "canvas-proxy");

async function copyWebDist() {
    if (!existsSync(webDist)) {
        throw new Error(`未找到前端产物 ${webDist}，请先在 web 目录执行 bun run build`);
    }
    const target = path.join(resourcesDir, "web");
    await rm(target, { recursive: true, force: true });
    await cp(webDist, target, { recursive: true });
}

// canvas-proxy 是 ESM，Electron 主进程以 CommonJS 加载时无法直接 require，
// 因此打成 CJS；import.meta.url 通过 shim 注入，保证 package.json 仍能按相对路径读取。
async function bundleProxy() {
    const target = path.join(resourcesDir, "canvas-proxy");
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    await build({
        entryPoints: [path.join(proxyDir, "index.js")],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: path.join(target, "index.cjs"),
        inject: [path.join(desktopDir, "scripts", "import-meta-shim.js")],
        define: { "import.meta.url": "importMetaUrl" },
        logLevel: "warning",
    });
    await cp(path.join(proxyDir, "package.json"), path.join(target, "package.json"));
}

async function renderIcon() {
    const svg = await readFile(path.join(desktopDir, "assets", "icon.svg"), "utf8");
    const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1024 } });
    await mkdir(buildDir, { recursive: true });
    await writeFile(path.join(buildDir, "icon.png"), resvg.render().asPng());
}

await copyWebDist();
await bundleProxy();
await renderIcon();
console.log("桌面端资源准备完成");
