import { GatewayError } from "./errors";

const maximumJsonResponseBytes = 256 * 1024;
const defaultJsonResponseTimeoutMs = 10_000;

type OutboundRequestInit = RequestInit & {
	readonly timeoutMs?: number;
};

/**
 * The timeout covers connection and response headers only, so returned streams
 * are never buffered or cut off by this helper.
 */
export async function fetchUpstream(
	value: string | URL,
	{ timeoutMs = 30_000, ...init }: OutboundRequestInit = {},
): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(value, {
			...init,
			credentials: "omit",
			signal: init.signal ?? controller.signal,
		});
	} finally {
		clearTimeout(timer);
	}
}

/** Read bounded JSON for metadata and token endpoints; never use this for streams. */
export async function readJsonResponse(
	response: Response,
	timeoutMs = defaultJsonResponseTimeoutMs,
): Promise<unknown> {
	const contentLength = response.headers.get("content-length");
	if (contentLength && Number(contentLength) > maximumJsonResponseBytes) {
		await response.body?.cancel().catch(() => undefined);
		throw new GatewayError(
			502,
			"UPSTREAM_RESPONSE_TOO_LARGE",
			"The upstream JSON response is too large.",
		);
	}
	if (!response.body) return null;
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let length = 0;
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		void reader.cancel();
	}, timeoutMs);
	try {
		for (;;) {
			const chunk = await reader.read();
			if (chunk.done) break;
			length += chunk.value.byteLength;
			if (length > maximumJsonResponseBytes) {
				throw new GatewayError(
					502,
					"UPSTREAM_RESPONSE_TOO_LARGE",
					"The upstream JSON response is too large.",
				);
			}
			chunks.push(chunk.value);
		}
	} catch (error) {
		if (!timedOut) throw error;
	} finally {
		clearTimeout(timer);
		await reader.cancel().catch(() => undefined);
	}
	if (timedOut) {
		throw new GatewayError(
			502,
			"UPSTREAM_RESPONSE_TIMEOUT",
			"The upstream JSON response timed out.",
		);
	}
	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	try {
		return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
	} catch {
		throw new GatewayError(
			502,
			"UPSTREAM_JSON_INVALID",
			"The upstream returned invalid JSON.",
		);
	}
}
