import { afterAll, expect, test } from "bun:test";

// Config and i18n use browser storage during module initialization.
const values = new Map<string, string>();
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
    },
});
afterAll(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});

const { defaultConfig, mergePersistedConfig, withLocalProxy } = await import("../src/stores/use-config-store");

const runtimeProxyUrl = "http://127.0.0.1:23210";

test("desktop defaults to direct connection without forcing proxy", () => {
    const merged = mergePersistedConfig(
        defaultConfig,
        { config: { proxyEnabled: false, proxyUrl: runtimeProxyUrl } },
        runtimeProxyUrl,
    );

    expect(merged.config.proxyEnabled).toBe(false);
    expect(merged.config.proxyUrl).toBe("http://127.0.0.1:23210");
});

test("desktop keeps proxyEnabled false by default when not configured", () => {
    const merged = mergePersistedConfig(
        defaultConfig,
        {},
        runtimeProxyUrl,
    );

    expect(merged.config.proxyEnabled).toBe(false);
});

test("desktop keeps persisted provider credentials and direct connection preference", () => {
    const merged = mergePersistedConfig(
        defaultConfig,
        { config: { apiKey: "persisted-key", proxyEnabled: false, proxyUrl: runtimeProxyUrl } },
        runtimeProxyUrl,
    );

    expect(merged.config.apiKey).toBe("persisted-key");
    expect(merged.config.proxyEnabled).toBe(false);
    expect(merged.config.proxyUrl).toBe(runtimeProxyUrl);
});

test("web runtime keeps the persisted proxy preference", () => {
    const merged = mergePersistedConfig(
        defaultConfig,
        { config: { proxyEnabled: false, proxyUrl: "http://127.0.0.1:9999" } },
        "",
    );

    expect(merged.config.proxyEnabled).toBe(false);
    expect(merged.config.proxyUrl).toBe("http://127.0.0.1:9999");
});

test("withLocalProxy returns direct url when proxyEnabled is false", () => {
    const url = "https://api.openai.com/v1/images/generations";
    expect(withLocalProxy(url)).toBe(url);
});
