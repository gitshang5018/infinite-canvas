import i18n from "@/i18n";
import { toProxiedGithubUrl, toProxiedImageUrl, type PromptSource } from "./prompt-source-presets";

export type RawPrompt = {
    id: string;
    title: string;
    prompt: string;
    description: string;
    coverUrl: string;
    referenceImageUrls: string[];
    tags: string[];
    preview: string;
    createdAt: string;
    updatedAt: string;
    author?: string;
    sourceUrl?: string;
    imageMode?: string;
    imageModel?: string;
    imageSize?: string;
    imageCount?: number;
};

type RunOptions = { signal?: AbortSignal };

async function fetchSource(source: PromptSource, options?: RunOptions) {
    const fetchUrl = toProxiedGithubUrl(source.url);
    const response = await fetch(fetchUrl, { cache: "no-store", signal: options?.signal });
    if (!response.ok) throw new Error(i18n.t("config.promptSources.runtime.requestFailed", { status: response.status }));
    return response.json();
}

export async function runPromptSource(source: PromptSource, options?: RunOptions): Promise<RawPrompt[]> {
    if (!source.url.trim()) throw new Error(i18n.t("config.promptSources.runtime.urlRequired"));
    let data: unknown;
    try {
        data = await fetchSource(source, options);
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        throw new Error(i18n.t("config.promptSources.runtime.fetchFailed", { name: source.name, error: error instanceof Error ? error.message : String(error) }));
    }

    const items = parseJsonSource(data, source);
    if (source.builtIn && !items.length) throw new Error(i18n.t("config.promptSources.runtime.noPrompts", { name: source.name }));
    return items;
}

function parseJsonSource(data: unknown, source: PromptSource) {
    let list: unknown[];
    if (Array.isArray(data)) {
        list = data;
    } else if (data && typeof data === "object") {
        const obj = data as Record<string, unknown>;
        if (Array.isArray(obj.items)) list = obj.items;
        else if (Array.isArray(obj.prompts)) list = obj.prompts;
        else if (Array.isArray(obj.data)) list = obj.data;
        else throw new Error(i18n.t("config.promptSources.runtime.invalidRoot", { name: source.name }));
    } else {
        throw new Error(i18n.t("config.promptSources.runtime.invalidRoot", { name: source.name }));
    }
    return normalizeItems(list, source);
}

function normalizeItems(values: unknown[], source: PromptSource) {
    const seen = new Set<string>();
    const items: RawPrompt[] = [];
    values.forEach((value, index) => {
        const record = asRecord(value);
        const title = (
            stringValue(record.title) ||
            stringValue(record.name_zh) ||
            stringValue(record.name) ||
            stringValue(record.name_en)
        ).trim();

        let prompt = stringValue(record.prompt).trim();
        if (!prompt && (record.prompt_zh || record.prompt_en)) {
            prompt = (stringValue(record.prompt_zh) || stringValue(record.prompt_en)).trim();
        }
        if (!prompt && Array.isArray(record.prompts)) {
            const arr = stringArray(record.prompts);
            prompt = (arr[1] || arr[0] || "").trim();
        }
        if (!prompt && (record.instruction || record.text)) {
            prompt = (stringValue(record.instruction) || stringValue(record.text)).trim();
        }

        if (!title || !prompt) return;
        const id = stringValue(record.id).trim() || (record.n ? `${source.id}-${record.n}` : `${source.id}-${leftPad(index + 1)}`);
        if (seen.has(id)) return;
        seen.add(id);

        const rawRefImages = stringArray(record.referenceImageUrls || record.images);
        const referenceImageUrls = rawRefImages.map((url) => resolveItemUrl(source.url, url));
        const rawCover = stringValue(record.coverUrl) || stringValue(record.image) || stringValue(record.coverImage) || (record.file ? `images/${stringValue(record.file)}` : "");
        const coverUrl = rawCover ? resolveItemUrl(source.url, rawCover) : referenceImageUrls[0] || "";

        const tags = stringArray(record.tags);
        const category = stringValue(record.categoryLabel) || stringValue(record.category);
        if (category && !tags.includes(category)) tags.push(category);

        const sourceObj = asRecord(record.source);
        const author = stringValue(record.author) || stringValue(sourceObj.name);
        const sourceUrl = resolveItemUrl(source.url, stringValue(record.sourceUrl) || stringValue(sourceObj.url));

        items.push({
            id,
            title,
            prompt,
            description: stringValue(record.description) || stringValue(record.summary) || stringValue(record.tagline),
            coverUrl,
            referenceImageUrls,
            tags,
            preview: stringValue(record.preview),
            createdAt: stringValue(record.createdAt),
            updatedAt: stringValue(record.updatedAt),
            author,
            sourceUrl,
            imageMode: optionalString(record.imageMode),
            imageModel: optionalString(record.imageModel) || optionalString(record.model),
            imageSize: optionalString(record.imageSize) || optionalString(record.aspect_ratio),
            imageCount: optionalNumber(record.imageCount),
        });
    });
    return items;
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
    return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function stringArray(value: unknown) {
    return Array.isArray(value) ? value.map(stringValue).map((item) => item.trim()).filter(Boolean) : [];
}

function optionalString(value: unknown) {
    const result = stringValue(value).trim();
    return result || undefined;
}

function optionalNumber(value: unknown) {
    const result = Number(value);
    return Number.isFinite(result) && result > 0 ? result : undefined;
}

function resolveItemUrl(baseUrl: string, path: string) {
    if (!path) return "";
    let effectivePath = path;
    if (baseUrl.includes("songguoxs/gpt4o-image-prompts") && effectivePath.startsWith("images/")) {
        effectivePath = `../${effectivePath}`;
    }
    try {
        const resolved = new URL(effectivePath, baseUrl).toString();
        return toProxiedImageUrl(resolved);
    } catch {
        return toProxiedImageUrl(effectivePath);
    }
}

function leftPad(value: number) {
    return String(value).padStart(4, "0");
}
