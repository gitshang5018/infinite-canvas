import { nanoid } from "nanoid";

export type PromptSource = {
    id: string;
    name: string;
    url: string;
    homepage: string;
    enabled: boolean;
    builtIn: boolean;
};

export const GITHUB_PROXY_PREFIX = "https://github.adc.dpdns.org/";
export const IMAGE_PROXY_PREFIX = "https://wsrv.nl/?url=";

export function toProxiedGithubUrl(url: string): string {
    if (!url) return "";
    const trimmed = url.trim();
    if (trimmed.startsWith(GITHUB_PROXY_PREFIX)) return trimmed;
    try {
        const parsed = new URL(trimmed);
        if (
            parsed.hostname === "raw.githubusercontent.com" ||
            parsed.hostname === "github.com" ||
            parsed.hostname === "avatars.githubusercontent.com" ||
            parsed.hostname.endsWith(".githubusercontent.com")
        ) {
            return `${GITHUB_PROXY_PREFIX}${trimmed}`;
        }
    } catch {
        // invalid URL, ignore
    }
    return trimmed;
}

export function toProxiedImageUrl(url: string): string {
    if (!url) return "";
    let trimmed = url.trim();
    if (trimmed.includes("songguoxs/gpt4o-image-prompts") && trimmed.includes("/data/images/")) {
        trimmed = trimmed.replace("/data/images/", "/images/");
    }
    if (trimmed.startsWith(GITHUB_PROXY_PREFIX) || trimmed.startsWith(IMAGE_PROXY_PREFIX)) {
        return trimmed;
    }
    try {
        const parsed = new URL(trimmed);
        if (
            parsed.hostname === "raw.githubusercontent.com" ||
            parsed.hostname === "github.com" ||
            parsed.hostname === "avatars.githubusercontent.com" ||
            parsed.hostname.endsWith(".githubusercontent.com")
        ) {
            return `${GITHUB_PROXY_PREFIX}${trimmed}`;
        }
        if (parsed.hostname.endsWith("youmind.com")) {
            return `${IMAGE_PROXY_PREFIX}${encodeURIComponent(trimmed)}`;
        }
    } catch {
        // invalid URL, ignore
    }
    return trimmed;
}

export const PROMPT_REGISTRY_HOMEPAGE = "https://github.com/yukkcat/image-prompts";
export const PROMPT_REGISTRY_SOURCE_BASE = `${GITHUB_PROXY_PREFIX}https://raw.githubusercontent.com/yukkcat/image-prompts/main/dist/sources`;

export function createPromptSource(source?: Partial<PromptSource>): PromptSource {
    return {
        id: source?.id?.trim() || nanoid(),
        name: source?.name?.trim() || "",
        url: source?.url?.trim() || "",
        homepage: source?.homepage?.trim() || "",
        enabled: source?.enabled ?? true,
        builtIn: source?.builtIn ?? false,
    };
}

export const DEFAULT_PROMPT_SOURCES: PromptSource[] = [
    registrySource("banana-prompt-quicker", "Banana Prompt Quicker", "https://glidea.github.io/banana-prompt-quicker/"),
    registrySource("davidwu-gpt-image2-prompts", "DavidWu GPT Image 2", "https://github.com/davidwuw0811-boop/awesome-gpt-image2-prompts"),
    registrySource("freestylefly-gpt-image-2", "Freestylefly GPT Image 2", "https://github.com/freestylefly/awesome-gpt-image-2"),
    registrySource("awesome-gpt-image", "Awesome GPT Image", "https://github.com/ZeroLu/awesome-gpt-image"),
    registrySource("awesome-gpt4o-image-prompts", "Awesome GPT-4o", "https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts"),
    registrySource("youmind-gpt-image-2", "YouMind GPT Image 2", "https://github.com/YouMind-OpenLab/awesome-gpt-image-2"),
    registrySource("youmind-nano-banana-pro", "YouMind Nano Banana Pro", "https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts"),
    githubRawSource(
        "apimodels-gpt-image-2",
        "ApiModels GPT Image 2",
        "https://raw.githubusercontent.com/apimodels/gpt-image-2-prompts/master/prompts.json",
        "https://github.com/apimodels/gpt-image-2-prompts",
    ),
    githubRawSource(
        "songguoxs-gpt4o-prompts",
        "Songguo GPT-4o Prompts",
        "https://raw.githubusercontent.com/songguoxs/gpt4o-image-prompts/master/data/prompts.json",
        "https://github.com/songguoxs/gpt4o-image-prompts",
    ),
    githubRawSource(
        "stretchcloud-gpt-image-2-5",
        "StretchCloud GPT Image 2.5",
        "https://raw.githubusercontent.com/stretchcloud/awesome-gpt-image-prompt-2.5/main/data/prompts.json",
        "https://github.com/stretchcloud/awesome-gpt-image-prompt-2.5",
    ),
];

function registrySource(id: string, name: string, homepage: string): PromptSource {
    return { id, name, url: `${PROMPT_REGISTRY_SOURCE_BASE}/${id}.json`, homepage, enabled: true, builtIn: true };
}

function githubRawSource(id: string, name: string, rawUrl: string, homepage: string): PromptSource {
    return { id, name, url: toProxiedGithubUrl(rawUrl), homepage, enabled: true, builtIn: true };
}
