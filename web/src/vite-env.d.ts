/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __APP_RELEASES__: import("@/lib/release").ReleaseInfo[];

interface DesktopWindowApi {
    platform: NodeJS.Platform;
    minimize: () => void;
    toggleMaximize: () => void;
    close: () => void;
}

interface Window {
    desktopWindow?: DesktopWindowApi;
}

interface ImportMetaEnv {
    // Comma-separated local development plugin URLs, refetched on every startup without caching or persistence.
    readonly VITE_DEV_PLUGINS?: string;
    // Optional build-time analytics configuration, with one independent variable per provider.
    // GA4 measurement ID (G-XXXX)
    readonly VITE_ANALYTICS_GA4_ID?: string;
    // Baidu Analytics site ID
    readonly VITE_ANALYTICS_BAIDU_ID?: string;
    // Local proxy address used when the app runs inside the desktop client.
    readonly VITE_LOCAL_PROXY_URL?: string;
    // Set to "1" when the app runs inside the desktop client.
    readonly VITE_DESKTOP?: string;
}
