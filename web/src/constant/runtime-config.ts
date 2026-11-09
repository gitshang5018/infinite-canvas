// Runtime configuration access layer.
// Priority: window.__RUNTIME_CONFIG__ (injected by the container entrypoint) > build-time VITE_ variables > defaults.
// This supports both configuring the same image with docker run -e and injecting values during custom builds.
//
// Each analytics provider has its own variable; configured providers are enabled independently and all are disabled by default.
// Only GA4 and Baidu are supported. Both accept IDs only, and script URLs are assembled in code without arbitrary scripts or inline JavaScript.

type RuntimeConfig = {
    ANALYTICS_GA4_ID?: string; // GA4 measurement ID (G-XXXX)
    ANALYTICS_BAIDU_ID?: string; // Baidu Analytics site ID
    LOCAL_PROXY_URL?: string; // Local proxy address, injected by the desktop client
    DESKTOP?: string; // Set by the desktop client to mark the desktop runtime
    DESKTOP_PLATFORM?: string; // Operating system reported by the desktop client
};

declare global {
    interface Window {
        __RUNTIME_CONFIG__?: RuntimeConfig;
    }
}

const runtime: RuntimeConfig = (typeof window !== "undefined" && window.__RUNTIME_CONFIG__) || {};

function read(key: keyof RuntimeConfig, buildTime: string | undefined, fallback = ""): string {
    const value = runtime[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof buildTime === "string" && buildTime.trim()) return buildTime.trim();
    return fallback;
}

export const ANALYTICS_GA4_ID = read("ANALYTICS_GA4_ID", import.meta.env.VITE_ANALYTICS_GA4_ID);
export const ANALYTICS_BAIDU_ID = read("ANALYTICS_BAIDU_ID", import.meta.env.VITE_ANALYTICS_BAIDU_ID);
// The desktop client ships with a local proxy and injects its address here, so requests go through it without extra setup.
// The desktop client manages the local proxy itself, so the UI hides the manual start command.
export const IS_DESKTOP = read("DESKTOP", import.meta.env.VITE_DESKTOP) === "1"
    || (typeof window !== "undefined" && Boolean(
        (window as unknown as { desktopWindow?: unknown }).desktopWindow
        || (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
        || (window as unknown as { __TAURI__?: unknown }).__TAURI__
    ));
// The desktop client ships with a local proxy and injects its address here, so requests go through it without extra setup.
export const LOCAL_PROXY_URL = read("LOCAL_PROXY_URL", import.meta.env.VITE_LOCAL_PROXY_URL) || (IS_DESKTOP ? "http://127.0.0.1:23210" : "");
// A desktop runtime always needs its bundled proxy: a persisted profile may have disabled
// the proxy or retained a stale address from an earlier installation.
export const EFFECTIVE_LOCAL_PROXY_URL = IS_DESKTOP ? (LOCAL_PROXY_URL || "http://127.0.0.1:23210") : "";
