import { GatewayError } from "./errors";

export function parseHttpUrl(value: string): URL {
	try {
		const url = new URL(value);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			throw new Error("Unsupported protocol");
		}
		return url;
	} catch {
		throw new GatewayError(
			400,
			"INVALID_UPSTREAM_URL",
			"Enter a valid HTTP(S) upstream URL.",
		);
	}
}

export function appendUpstreamPath(
	base: URL,
	incomingPath: string,
	search: string,
): URL {
	const normalizedPath = incomingPath.replace(/^\/+/, "");
	const segments = normalizedPath.split("/");
	if (
		segments.some((segment) => {
			let decoded = segment;
			for (let index = 0; index < 2; index += 1) {
				try {
					decoded = decodeURIComponent(decoded);
				} catch {
					return true;
				}
			}
			if (decoded.includes("\0")) return true;
			return decoded
				.replaceAll("\\", "/")
				.split("/")
				.some((part) => part === "." || part === "..");
		})
	) {
		throw new GatewayError(
			400,
			"INVALID_PROXY_PATH",
			"The proxy path contains an invalid segment.",
		);
	}

	const upstream = new URL(base);
	const basePath = upstream.pathname.endsWith("/")
		? upstream.pathname
		: `${upstream.pathname}/`;
	upstream.pathname = `${basePath}${normalizedPath}`;
	upstream.search = search;
	return upstream;
}
