const { app, BrowserWindow, Menu, shell, session } = require("electron");
const http = require("node:http");
const net = require("node:net");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");

// 桌面端用本机 HTTP 服务承载 Web 前端：origin 固定不变，画布数据、API Key 等浏览器本地存储与 Web 版行为一致。
const SERVER_PORT = 23211;
// 与前端 DEFAULT_LOCAL_PROXY_URL 保持一致。
const PROXY_PORT = 23210;

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".txt": "text/plain; charset=utf-8",
    ".map": "application/json; charset=utf-8",
};

let mainWindow = null;
let proxyProcess = null;
let proxyUrl = "";

// 打包后资源在 resources 下，开发时直接读取仓库里的 web/dist 与 canvas-proxy 源码。
function resolveWebRoot() {
    const packaged = path.join(process.resourcesPath, "web");
    if (fs.existsSync(packaged)) return packaged;
    return path.join(__dirname, "..", "web", "dist");
}

function resolveProxyEntry() {
    const packaged = path.join(process.resourcesPath, "canvas-proxy", "index.cjs");
    if (fs.existsSync(packaged)) return packaged;
    return path.join(__dirname, "..", "canvas-proxy", "index.cjs");
}

/** 运行时配置由桌面端下发：写入本地代理地址后，前端默认开启本地代理。 */
function runtimeConfigScript() {
    return `window.__RUNTIME_CONFIG__ = ${JSON.stringify({
        ANALYTICS_GA4_ID: "",
        ANALYTICS_BAIDU_ID: "",
        DESKTOP: "1",
        LOCAL_PROXY_URL: proxyUrl,
    })};`;
}

/** 端口是否已被其他进程占用。 */
function isPortOccupied(port) {
    return new Promise((resolve) => {
        const socket = net.connect({ host: "127.0.0.1", port });
        socket.setTimeout(1000);
        socket.on("connect", () => {
            socket.destroy();
            resolve(true);
        });
        socket.on("error", () => resolve(false));
        socket.on("timeout", () => {
            socket.destroy();
            resolve(false);
        });
    });
}

/** 探测本机端口上是否已经是 canvas-proxy。 */
function probeProxy(port) {
    return new Promise((resolve) => {
        const request = http.get({ host: "127.0.0.1", port, path: "/", timeout: 1000 }, (response) => {
            let body = "";
            response.on("data", (chunk) => (body += chunk));
            response.on("end", () => {
                try {
                    const data = JSON.parse(body);
                    resolve(Boolean(data && data.proxy));
                } catch {
                    resolve(false);
                }
            });
        });
        request.on("error", () => resolve(false));
        request.on("timeout", () => {
            request.destroy();
            resolve(false);
        });
    });
}

/**
 * 启动仓库内置的 canvas-proxy：前端在浏览器里直连第三方 AI 接口会被跨域拦截，
 * 本地代理负责转发。端口已被同款代理占用时直接复用，被其他程序占用时跳过。
 */
async function startLocalProxy() {
    if (await isPortOccupied(PROXY_PORT)) {
        if (await probeProxy(PROXY_PORT)) proxyUrl = `http://127.0.0.1:${PROXY_PORT}`;
        else console.warn(`[proxy] 端口 ${PROXY_PORT} 被其他程序占用，跳过本地代理启动`);
        return;
    }
    const entry = resolveProxyEntry();
    if (!fs.existsSync(entry)) {
        console.warn("[proxy] 未找到 canvas-proxy 源码，跳过本地代理启动");
        return;
    }
    proxyProcess = spawn(process.execPath, [entry, "--port", String(PROXY_PORT), "--host", "127.0.0.1"], {
        // ELECTRON_RUN_AS_NODE 让打包后的 Electron 以外部 Node 的方式执行代理脚本。
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        stdio: ["ignore", "pipe", "pipe"],
    });
    proxyProcess.stdout.on("data", (chunk) => console.log(`[proxy] ${chunk.toString().trim()}`));
    proxyProcess.stderr.on("data", (chunk) => console.error(`[proxy] ${chunk.toString().trim()}`));
    proxyProcess.on("exit", (code) => {
        proxyProcess = null;
        console.log(`[proxy] 已退出，退出码 ${code}`);
    });
    for (let attempt = 0; attempt < 25; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (await probeProxy(PROXY_PORT)) {
            proxyUrl = `http://127.0.0.1:${PROXY_PORT}`;
            return;
        }
    }
    console.warn("[proxy] 本地代理未就绪，前端将直连接口");
}

/** 静态资源服务：找不到文件且不是资源路径时回退到 index.html，交给前端路由处理。 */
function createStaticServer(root) {
    return http.createServer(async (request, response) => {
        const pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname);
        if (pathname === "/config.js") {
            response.writeHead(200, { "content-type": MIME_TYPES[".js"], "cache-control": "no-store" });
            response.end(runtimeConfigScript());
            return;
        }
        const target = path.join(root, pathname);
        if (!target.startsWith(root)) {
            response.writeHead(403);
            response.end();
            return;
        }
        let filePath = target;
        let stat = await fsp.stat(filePath).catch(() => null);
        if (stat?.isDirectory()) {
            filePath = path.join(filePath, "index.html");
            stat = await fsp.stat(filePath).catch(() => null);
        }
        if (!stat?.isFile()) {
            if (path.extname(pathname)) {
                response.writeHead(404);
                response.end();
                return;
            }
            filePath = path.join(root, "index.html");
            stat = await fsp.stat(filePath).catch(() => null);
            if (!stat?.isFile()) {
                response.writeHead(404);
                response.end();
                return;
            }
        }
        response.writeHead(200, {
            "content-type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
            "content-length": stat.size,
        });
        fs.createReadStream(filePath).pipe(response);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 960,
        minHeight: 640,
        title: "无限画布",
        backgroundColor: "#1c1917",
        show: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    mainWindow.once("ready-to-show", () => mainWindow.show());
    mainWindow.on("closed", () => (mainWindow = null));
    // 外部链接交给系统浏览器，站内导航留在应用内。
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) shell.openExternal(url);
        return { action: "deny" };
    });
    mainWindow.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith(`http://127.0.0.1:${SERVER_PORT}`)) {
            event.preventDefault();
            if (/^https?:\/\//i.test(url)) shell.openExternal(url);
        }
    });
    mainWindow.loadURL(`http://127.0.0.1:${SERVER_PORT}/`);
}

function createMenu() {
    Menu.setApplicationMenu(
        Menu.buildFromTemplate([
            {
                label: "无限画布",
                submenu: [
                    { label: "重新加载", role: "reload" },
                    { label: "开发者工具", role: "toggleDevTools" },
                    { type: "separator" },
                    { label: "退出", role: "quit" },
                ],
            },
            {
                label: "编辑",
                submenu: [
                    { label: "撤销", role: "undo" },
                    { label: "重做", role: "redo" },
                    { type: "separator" },
                    { label: "剪切", role: "cut" },
                    { label: "复制", role: "copy" },
                    { label: "粘贴", role: "paste" },
                    { label: "全选", role: "selectAll" },
                ],
            },
            {
                label: "视图",
                submenu: [
                    { label: "实际大小", role: "resetZoom" },
                    { label: "放大", role: "zoomIn" },
                    { label: "缩小", role: "zoomOut" },
                    { type: "separator" },
                    { label: "全屏", role: "togglefullscreen" },
                ],
            },
        ]),
    );
}

/** 下载文件落到系统下载目录，同名文件自动追加序号。 */
async function resolveDownloadPath(fileName) {
    const dir = app.getPath("downloads");
    const ext = path.extname(fileName);
    const base = path.basename(fileName, ext);
    for (let index = 0; index < 100; index += 1) {
        const candidate = path.join(dir, index === 0 ? fileName : `${base} (${index})${ext}`);
        if (!fs.existsSync(candidate)) return candidate;
    }
    return path.join(dir, fileName);
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on("second-instance", () => {
        if (!mainWindow) return;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    });

    app.whenReady().then(async () => {
        await startLocalProxy();
        const server = createStaticServer(resolveWebRoot());
        await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(SERVER_PORT, "127.0.0.1", resolve);
        });
        createMenu();
        session.defaultSession.on("will-download", (item) => {
            resolveDownloadPath(item.getFilename()).then((savePath) => item.setSavePath(savePath));
        });
        createWindow();
        app.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") app.quit();
    });

    app.on("before-quit", () => {
        if (proxyProcess) proxyProcess.kill();
    });
}
