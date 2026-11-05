import { createPortal } from "react-dom";

export const DESKTOP_WINDOW_CONTROLS_WIDTH = 148;

/**
 * 顶行空白处的窗口拖动手柄。
 *
 * Electron 用 `-webkit-app-region: drag`（CSS 继承语义，后代可交互元素自动豁免），
 * Tauri 用 `data-tauri-drag-region="deep"`（子树语义，可交互元素同样自动阻断），
 * 两者行为一致，因此同一个元素可以同时服务两个容器。
 */
export function DesktopDragHandle({ className }: { className?: string }) {
    if (!window.desktopWindow) return null;
    return <div aria-hidden data-tauri-drag-region="deep" className={`desktop-titlebar-drag-region pointer-events-auto min-w-0 flex-1 ${className ?? ""}`} />;
}

export function DesktopTitlebar() {
    const desktopWindow = window.desktopWindow;
    if (!desktopWindow || desktopWindow.platform === "darwin") return null;

    return createPortal(
        <div className="desktop-window-controls fixed right-0 top-0 z-[1000] flex" style={{ height: 36 }}>
            <button type="button" className="desktop-window-control" aria-label="最小化" onClick={() => desktopWindow.minimize()}>
                <svg viewBox="0 0 12 12" aria-hidden>
                    <path d="M2.5 6.25h7" />
                </svg>
            </button>
            <button type="button" className="desktop-window-control" aria-label="最大化" onClick={() => desktopWindow.toggleMaximize()}>
                <svg viewBox="0 0 12 12" aria-hidden>
                    <rect x="2.5" y="2.5" width="7" height="7" rx="0.5" />
                </svg>
            </button>
            <button type="button" className="desktop-window-control desktop-window-control-close" aria-label="关闭" onClick={() => desktopWindow.close()}>
                <svg viewBox="0 0 12 12" aria-hidden>
                    <path d="m3 3 6 6M9 3 3 9" />
                </svg>
            </button>
        </div>,
        document.body,
    );
}
