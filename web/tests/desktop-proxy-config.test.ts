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

const { defaultConfig, mergePersistedConfig } = await import("../src/stores/use-config-store");

const runtimeProxyUrl = "http://127.0.0.1:23210";

test("desktop runtime proxy overrides a persisted disabled proxy setting", () => {
    const merged = mergePersistedConfig(
        defaultConfig,
        { config: { proxyEnabled: false, proxyUrl: runtimeProxyUrl } },
        runtimeProxyUrl,
    );

    expect(merged.config.proxyEnabled).toBe(true);
    expect(merged.config.proxyUrl).toBe("http://127.0.0.1:23210");
});

test("desktop runtime proxy overrides a persisted stale proxy address", () => {
    const merged = mergePersistedConfig(
        defaultConfig,
        { config: { proxyEnabled: true, proxyUrl: "http://127.0.0.1:9999" } },
        runtimeProxyUrl,
    );

    expect(merged.config.proxyEnabled).toBe(true);
    expect(merged.config.proxyUrl).toBe(runtimeProxyUrl);
});

test("desktop runtime proxy override keeps persisted provider credentials", () => {
    const merged = mergePersistedConfig(
        defaultConfig,
        { config: { apiKey: "persisted-key", proxyEnabled: false, proxyUrl: runtimeProxyUrl } },
        runtimeProxyUrl,
    );

    expect(merged.config.apiKey).toBe("persisted-key");
    expect(merged.config.proxyEnabled).toBe(true);
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
