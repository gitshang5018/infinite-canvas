import { expect, test } from "bun:test";

import {
    DEFAULT_PROMPT_SOURCES,
    GITHUB_PROXY_PREFIX,
    PROMPT_REGISTRY_HOMEPAGE,
    PROMPT_REGISTRY_SOURCE_BASE,
    toProxiedGithubUrl,
} from "../src/services/api/prompt-source-presets";

test("built-in prompt sources use the GitHub reverse proxy", () => {
    expect(PROMPT_REGISTRY_HOMEPAGE).toBe("https://github.com/yukkcat/image-prompts");
    expect(PROMPT_REGISTRY_SOURCE_BASE).toBe(`${GITHUB_PROXY_PREFIX}https://raw.githubusercontent.com/yukkcat/image-prompts/main/dist/sources`);

    expect(DEFAULT_PROMPT_SOURCES.length).toBeGreaterThanOrEqual(10);
    const ids = DEFAULT_PROMPT_SOURCES.map((s) => s.id);
    expect(ids).toContain("apimodels-gpt-image-2");
    expect(ids).toContain("songguoxs-gpt4o-prompts");
    expect(ids).toContain("stretchcloud-gpt-image-2-5");

    for (const source of DEFAULT_PROMPT_SOURCES) {
        expect(source.builtIn).toBe(true);
        expect(source.enabled).toBe(true);
        expect(source.url.startsWith(GITHUB_PROXY_PREFIX)).toBe(true);
        expect(source.url).toContain("https://raw.githubusercontent.com/");
    }
});

test("toProxiedGithubUrl prefixes github resources and preserves non-github resources", () => {
    expect(toProxiedGithubUrl("https://raw.githubusercontent.com/owner/repo/main/data.json")).toBe(
        `${GITHUB_PROXY_PREFIX}https://raw.githubusercontent.com/owner/repo/main/data.json`,
    );
    expect(toProxiedGithubUrl("https://github.com/user-attachments/assets/12345")).toBe(
        `${GITHUB_PROXY_PREFIX}https://github.com/user-attachments/assets/12345`,
    );
    expect(toProxiedGithubUrl("https://avatars.githubusercontent.com/u/123")).toBe(
        `${GITHUB_PROXY_PREFIX}https://avatars.githubusercontent.com/u/123`,
    );
    // Already proxied
    expect(toProxiedGithubUrl(`${GITHUB_PROXY_PREFIX}https://raw.githubusercontent.com/a/b/c`)).toBe(
        `${GITHUB_PROXY_PREFIX}https://raw.githubusercontent.com/a/b/c`,
    );
    // Non-github
    expect(toProxiedGithubUrl("https://example.com/prompts.json")).toBe("https://example.com/prompts.json");
    expect(toProxiedGithubUrl("https://r2.apimodels.app/cover.png")).toBe("https://r2.apimodels.app/cover.png");
    expect(toProxiedGithubUrl("")).toBe("");
});
