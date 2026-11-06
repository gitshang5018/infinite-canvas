import { expect, test } from "bun:test";

import { DEFAULT_PROMPT_SOURCES, PROMPT_REGISTRY_HOMEPAGE, PROMPT_REGISTRY_SOURCE_BASE } from "../src/services/api/prompt-source-presets";

const proxyPrefix = "https://github.adc.dpdns.org/";

test("built-in prompt sources use the GitHub reverse proxy", () => {
    expect(PROMPT_REGISTRY_HOMEPAGE).toBe("https://github.com/yukkcat/image-prompts");
    expect(PROMPT_REGISTRY_SOURCE_BASE).toBe(`${proxyPrefix}https://raw.githubusercontent.com/yukkcat/image-prompts/main/dist/sources`);

    for (const source of DEFAULT_PROMPT_SOURCES) {
        expect(source.url.startsWith(proxyPrefix)).toBe(true);
        expect(source.url).toContain("https://raw.githubusercontent.com/yukkcat/image-prompts/main/dist/sources/");
    }
});
