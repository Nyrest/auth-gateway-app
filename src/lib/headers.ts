/** A user-configured outbound HTTP header before it is evaluated and sent. */
export type HeaderEntry = {
	readonly key: string;
	readonly value: string;
};

export type HeaderPolicy = "playground" | "provider";
export type HeaderValidationError = "invalid_headers";
export type HeaderValidationResult<T> =
	| { readonly value: T }
	| { readonly error: HeaderValidationError };

export const maximumHeaderEntries = 50;
export const maximumHeaderNameBytes = 1_024;
export const maximumHeaderValueBytes = 8_192;
export const maximumCustomHeadersBytes = 512 * 1_024;

const headerNamePattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/** These headers are connection metadata or gateway controls, never upstream input. */
const alwaysBlockedHeaders = new Set([
	"connection",
	"content-length",
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
	"x-forwarded-for",
	"x-forwarded-host",
	"x-forwarded-port",
	"x-forwarded-proto",
	"x-forwarded-server",
	"x-real-ip",
	"x-client-ip",
	"true-client-ip",
	"cf-connecting-ip",
	"x-auth-gateway-playground",
]);

const playgroundBlockedHeaders = new Set([
	...alwaysBlockedHeaders,
	"authorization",
	"cookie",
]);

/** Fetch header values allow horizontal tabs, visible ASCII, and obs-text. */
export function isValidHeaderValue(value: string): boolean {
	for (let index = 0; index < value.length; index += 1) {
		const code = value.charCodeAt(index);
		if (code <= 8 || (code >= 10 && code <= 31) || code === 127) {
			return false;
		}
	}
	return true;
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

function isBlockedHeader(name: string, policy: HeaderPolicy): boolean {
	const normalized = name.toLowerCase();
	return policy === "playground"
		? playgroundBlockedHeaders.has(normalized) ||
				normalized.startsWith("x-forwarded-")
		: alwaysBlockedHeaders.has(normalized) ||
				normalized.startsWith("x-forwarded-");
}

export function validateHeaderEntries(
	headers: readonly HeaderEntry[],
	policy: HeaderPolicy = "provider",
): HeaderValidationResult<HeaderEntry[]> {
	if (headers.length > maximumHeaderEntries)
		return { error: "invalid_headers" };
	const normalized = new Set<string>();
	const result: HeaderEntry[] = [];
	for (const header of headers) {
		if (
			!header ||
			typeof header !== "object" ||
			typeof header.key !== "string" ||
			typeof header.value !== "string"
		) {
			return { error: "invalid_headers" };
		}
		const key = header.key.trim();
		const lower = key.toLowerCase();
		if (
			!key ||
			!headerNamePattern.test(key) ||
			new TextEncoder().encode(key).byteLength > maximumHeaderNameBytes ||
			isBlockedHeader(key, policy) ||
			normalized.has(lower) ||
			!isValidHeaderValue(header.value) ||
			new TextEncoder().encode(header.value).byteLength >
				maximumHeaderValueBytes
		) {
			return { error: "invalid_headers" };
		}
		normalized.add(lower);
		result.push({ key, value: header.value });
	}
	if (
		new TextEncoder().encode(JSON.stringify(result)).byteLength >
		maximumCustomHeadersBytes
	)
		return { error: "invalid_headers" };
	return { value: result };
}

/** Parse the object representation shown in JSON mode. */
export function parseHeaderJson(
	value: string,
	policy: HeaderPolicy = "provider",
): HeaderValidationResult<HeaderEntry[]> {
	try {
		const parsed: unknown = JSON.parse(value);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return { error: "invalid_headers" };
		}
		const keys = topLevelObjectKeys(value);
		if (!keys) return { error: "invalid_headers" };
		const normalized = new Set<string>();
		for (const key of keys) {
			const normalizedKey = key.trim().toLowerCase();
			if (normalized.has(normalizedKey)) return { error: "invalid_headers" };
			normalized.add(normalizedKey);
		}
		const entries = Object.entries(parsed);
		if (entries.some(([, item]) => typeof item !== "string")) {
			return { error: "invalid_headers" };
		}
		return validateHeaderEntries(
			entries.map(([key, item]) => ({ key, value: item })),
			policy,
		);
	} catch {
		return { error: "invalid_headers" };
	}
}

/** Parse the encrypted canonical array representation. */
export function parseStoredHeaders(
	value: string | undefined,
	policy: HeaderPolicy = "provider",
): HeaderValidationResult<HeaderEntry[]> {
	if (value === undefined || value === "") return { value: [] };
	if (new TextEncoder().encode(value).byteLength > maximumCustomHeadersBytes)
		return { error: "invalid_headers" };
	if (!value.trim()) return { value: [] };
	try {
		const parsed: unknown = JSON.parse(value);
		if (!Array.isArray(parsed)) return { error: "invalid_headers" };
		if (
			parsed.some(
				(item) =>
					!item ||
					typeof item !== "object" ||
					typeof (item as { key?: unknown }).key !== "string" ||
					typeof (item as { value?: unknown }).value !== "string" ||
					Object.keys(item).some((key) => key !== "key" && key !== "value"),
			)
		) {
			return { error: "invalid_headers" };
		}
		return validateHeaderEntries(parsed as HeaderEntry[], policy);
	} catch {
		return { error: "invalid_headers" };
	}
}

export function headersToObject(
	headers: readonly HeaderEntry[],
): Record<string, string> {
	return Object.fromEntries(
		headers
			.filter((header) => header.key.trim() || header.value.length > 0)
			.map(({ key, value }) => [key.trim(), value]),
	);
}

export function headersToJson(headers: readonly HeaderEntry[]): string {
	return JSON.stringify(headersToObject(headers), null, 2);
}

export function serializeStoredHeaders(
	headers: readonly HeaderEntry[],
): string {
	return JSON.stringify(
		headers
			.filter((header) => header.key.trim() || header.value.length > 0)
			.map(({ key, value }) => ({ key, value })),
	);
}

export function headerConflicts(
	headers: readonly HeaderEntry[],
	knownNames: Iterable<string>,
): readonly string[] {
	const known = new Set([...knownNames].map((name) => name.toLowerCase()));
	return headers
		.filter((header) => known.has(header.key.trim().toLowerCase()))
		.map((header) => header.key.trim());
}

export function isAlwaysBlockedHeader(name: string): boolean {
	const normalized = name.trim().toLowerCase();
	return (
		alwaysBlockedHeaders.has(normalized) ||
		normalized.startsWith("x-forwarded-")
	);
}
