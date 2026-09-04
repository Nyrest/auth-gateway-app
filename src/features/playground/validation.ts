import type { PlaygroundHeader } from "./history";

const blockedHeaders = new Set([
	"authorization",
	"connection",
	"content-length",
	"cookie",
	"forwarded",
	"host",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"via",
	"x-auth-gateway-playground",
	"x-forwarded-for",
	"x-forwarded-host",
	"x-forwarded-port",
	"x-forwarded-proto",
	"x-forwarded-server",
	"x-real-ip",
]);
const headerNamePattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

export type PlaygroundValidationResult<T> =
	| { readonly value: T }
	| { readonly error: "invalid_headers" | "invalid_path" };

export function headersToText(headers: readonly PlaygroundHeader[]): string {
	return JSON.stringify(
		Object.fromEntries(headers.map(({ key, value }) => [key, value])),
		null,
		2,
	);
}

function skipWhitespace(value: string, index: number): number {
	while (/\s/.test(value[index] ?? "")) index += 1;
	return index;
}

function readJsonString(
	value: string,
	index: number,
): { readonly next: number; readonly text: string } | undefined {
	if (value[index] !== '"') return undefined;
	for (let cursor = index + 1; cursor < value.length; cursor += 1) {
		if (value[cursor] === "\\") {
			cursor += 1;
			continue;
		}
		if (value[cursor] !== '"') continue;
		try {
			const text = JSON.parse(value.slice(index, cursor + 1)) as unknown;
			return typeof text === "string" ? { next: cursor + 1, text } : undefined;
		} catch {
			return undefined;
		}
	}
	return undefined;
}

function skipJsonValue(value: string, index: number): number | undefined {
	const start = skipWhitespace(value, index);
	if (value[start] === '"') return readJsonString(value, start)?.next;
	if (value[start] !== "{" && value[start] !== "[") {
		let cursor = start;
		while (cursor < value.length && !",}]".includes(value[cursor] ?? "")) {
			cursor += 1;
		}
		return cursor;
	}

	const openings = new Map([
		["{", "}"],
		["[", "]"],
	]);
	const stack: string[] = [];
	for (let cursor = start; cursor < value.length; cursor += 1) {
		const character = value[cursor] ?? "";
		if (character === '"') {
			const string = readJsonString(value, cursor);
			if (!string) return undefined;
			cursor = string.next - 1;
			continue;
		}
		const close = openings.get(character);
		if (close) {
			stack.push(close);
			continue;
		}
		if (character !== stack.at(-1)) continue;
		stack.pop();
		if (stack.length === 0) return cursor + 1;
	}
	return undefined;
}

function topLevelObjectKeys(value: string): string[] | undefined {
	let cursor = skipWhitespace(value, 0);
	if (value[cursor] !== "{") return undefined;
	cursor = skipWhitespace(value, cursor + 1);
	if (value[cursor] === "}") return [];

	const keys: string[] = [];
	while (cursor < value.length) {
		const key = readJsonString(value, cursor);
		if (!key) return undefined;
		keys.push(key.text);
		cursor = skipWhitespace(value, key.next);
		if (value[cursor] !== ":") return undefined;
		const afterValue = skipJsonValue(value, cursor + 1);
		if (afterValue === undefined) return undefined;
		cursor = skipWhitespace(value, afterValue);
		if (value[cursor] === "}") return keys;
		if (value[cursor] !== ",") return undefined;
		cursor = skipWhitespace(value, cursor + 1);
	}
	return undefined;
}

export function validateHeaders(
	headers: readonly PlaygroundHeader[],
): PlaygroundValidationResult<PlaygroundHeader[]> {
	const normalized = new Set<string>();
	const result: PlaygroundHeader[] = [];
	for (const header of headers) {
		const key = header.key.trim();
		if (!key && !header.value) continue;
		const lower = key.toLowerCase();
		if (
			!headerNamePattern.test(key) ||
			blockedHeaders.has(lower) ||
			normalized.has(lower) ||
			/[\r\n]/.test(header.value) ||
			header.value.length > 8_192
		) {
			return { error: "invalid_headers" };
		}
		normalized.add(lower);
		result.push({ ...header, key, value: header.value });
	}
	return { value: result };
}

export function parseHeaders(
	value: string,
): PlaygroundValidationResult<PlaygroundHeader[]> {
	try {
		const parsed: unknown = JSON.parse(value);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return { error: "invalid_headers" };
		}
		const keys = topLevelObjectKeys(value);
		const normalized = new Set<string>();
		for (const key of keys ?? []) {
			const normalizedKey = key.trim().toLowerCase();
			if (normalized.has(normalizedKey)) return { error: "invalid_headers" };
			normalized.add(normalizedKey);
		}
		const entries = Object.entries(parsed);
		if (entries.some(([, item]) => typeof item !== "string")) {
			return { error: "invalid_headers" };
		}
		return validateHeaders(
			entries.map(([key, item]) => ({
				id: crypto.randomUUID(),
				key,
				value: item,
			})),
		);
	} catch {
		return { error: "invalid_headers" };
	}
}

export function normalizePlaygroundPath(
	value: string,
): PlaygroundValidationResult<string> {
	const path = value.trim();
	if (
		!path.startsWith("/") ||
		path.includes("#") ||
		path.startsWith("//") ||
		/^\/[a-z][a-z\d+.-]*:/i.test(path) ||
		path.length > 8_192
	) {
		return { error: "invalid_path" };
	}
	let decoded = path;
	for (let index = 0; index < 2; index += 1) {
		try {
			decoded = decodeURIComponent(decoded);
		} catch {
			return { error: "invalid_path" };
		}
	}
	if (
		decoded.includes("\0") ||
		decoded
			.slice(0, decoded.indexOf("?") === -1 ? undefined : decoded.indexOf("?"))
			.replaceAll("\\", "/")
			.split("/")
			.some((segment) => segment === "." || segment === "..")
	) {
		return { error: "invalid_path" };
	}
	return { value: path };
}
