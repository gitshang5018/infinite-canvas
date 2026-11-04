import { describe, expect, test } from "bun:test";

import { DESKTOP_TITLEBAR_HEIGHT, desktopTitlebarClassName } from "@/components/layout/desktop-titlebar";

describe("desktop titlebar layout", () => {
    test("keeps the transparent drag strip at the Windows caption height", () => {
        expect(DESKTOP_TITLEBAR_HEIGHT).toBe(36);
        expect(desktopTitlebarClassName()).toContain("desktop-titlebar-drag-region");
    });

    test("uses a frameless window with a preload bridge instead of a native caption", async () => {
        const mainProcess = await Bun.file(new URL("../../desktop/main.js", import.meta.url)).text();
        const preload = await Bun.file(new URL("../../desktop/preload.js", import.meta.url)).text();
        expect(mainProcess).toContain("frame: process.platform !== \"darwin\" ? false : true");
        expect(mainProcess).not.toContain("titleBarOverlay");
        expect(mainProcess).toContain('preload: path.join(__dirname, "preload.js")');
        expect(preload).toContain("contextBridge.exposeInMainWorld");
        expect(preload).toContain("minimize");
        expect(preload).toContain("toggleMaximize");
        expect(preload).toContain("close");
    });
});
