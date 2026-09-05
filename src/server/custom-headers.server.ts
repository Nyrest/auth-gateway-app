import {
	isAlwaysBlockedHeader,
	isValidHeaderValue,
	parseStoredHeaders,
} from "#/lib/headers";

import { GatewayError } from "./errors";
import { evaluateExpression } from "./expression.server";

function isSafeInjectedHeader(name: string, value: string): boolean {
	const normalized = name.toLowerCase();
	return (
		/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) &&
		isValidHeaderValue(value) &&
		!isAlwaysBlockedHeader(normalized) &&
		!normalized.startsWith("x-forwarded-") &&
		new TextEncoder().encode(value).byteLength <= 8_192
	);
}

/** Apply user-configured headers after provider auth and fixed policy. */
export function applyCustomHeaders(
	headers: Headers,
	secrets: ReadonlyMap<string, string>,
): void {
	const parsed = parseStoredHeaders(secrets.get("custom_headers"), "provider");
	if (!("value" in parsed)) {
		throw new GatewayError(
			400,
			"INVALID_INJECTED_HEADER",
			"The connection has invalid custom headers.",
		);
	}
	for (const header of parsed.value) {
		const value = evaluateExpression(header.value);
		if (!isSafeInjectedHeader(header.key, value)) {
			throw new GatewayError(
				400,
				"INVALID_INJECTED_HEADER",
				"The connection has an unsafe injected header.",
			);
		}
		headers.set(header.key, value);
	}
}
