// Tauri 注入的全局对象，带 withGlobalTauri: true 时可用。
type TauriGlobal = {
    core?: { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
};

function tauriGlobal(): TauriGlobal | undefined {
    if (typeof window === "undefined") return undefined;
    const injected = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
    return injected?.core ? injected : undefined;
}

/**
 * 在 Tauri 容器内补齐 Electron 版 preload 暴露的 window.desktopWindow，
 * 使前端业务代码无需区分容器实现。
 *
 * 窗口操作走应用自身的 #[tauri::command]，不依赖插件权限配置。
 * 运行时配置（window.__RUNTIME_CONFIG__）由 Tauri 的 initialization_script
 * 在页面脚本执行前注入，等价于 Electron 版的 /config.js。
 */
export function installDesktopWindowShim(): void {
    if (typeof window === "undefined" || window.desktopWindow) return;
    const tauri = tauriGlobal();
    if (!tauri?.core) return;

    const invoke = tauri.core.invoke;
    // 平台信息由 Rust 侧注入，比 navigator.platform 更可靠。
    const platform = window.__RUNTIME_CONFIG__?.DESKTOP_PLATFORM;
    window.desktopWindow = {
        platform: platform === "macos" ? "darwin" : "win32",
        minimize: () => {
            void invoke("desktop_window_minimize");
        },
        toggleMaximize: () => {
            void invoke("desktop_window_toggle_maximize");
        },
        close: () => {
            void invoke("desktop_window_close");
        },
    };
}
