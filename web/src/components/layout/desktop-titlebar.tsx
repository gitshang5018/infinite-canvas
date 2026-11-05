import { createPortal } from "react-dom";

export const DESKTOP_WINDOW_CONTROLS_WIDTH = 148;

export function DesktopDragHandle({ className }: { className?: string }) {
    if (!window.desktopWindow) return null;
    return <div aria-hidden className={`desktop-titlebar-drag-region pointer-events-auto min-w-0 flex-1 ${className ?? ""}`} />;
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
