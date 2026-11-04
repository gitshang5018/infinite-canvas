export const DESKTOP_TITLEBAR_HEIGHT = 36;

export function desktopTitlebarClassName() {
    return "desktop-titlebar-drag-region";
}

export function DesktopTitlebar() {
    const desktopWindow = window.desktopWindow;
    if (!desktopWindow || desktopWindow.platform === "darwin") return null;

    return (
        <>
            <div aria-hidden className={`${desktopTitlebarClassName()} absolute inset-x-0 top-0 z-[100]`} style={{ height: DESKTOP_TITLEBAR_HEIGHT }} />
            <div className="desktop-window-controls absolute right-0 z-[110] flex" style={{ top: DESKTOP_TITLEBAR_HEIGHT, height: 56 }}>
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
            </div>
        </>
    );
}
