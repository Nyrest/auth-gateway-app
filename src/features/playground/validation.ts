import type { HeaderEntry, HeaderValidationResult } from "#/lib/headers";
import { validateHeaderEntries } from "#/lib/headers";

export type PlaygroundHeader = HeaderEntry;
export type PlaygroundValidationResult<T> =
	| HeaderValidationResult<T>
	| { readonly error: "invalid_path" };

export function validateHeaders(
	headers: readonly PlaygroundHeader[],
): PlaygroundValidationResult<PlaygroundHeader[]> {
	return validateHeaderEntries(headers, "playground");
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
