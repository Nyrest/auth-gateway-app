import { GatewayError } from "./errors";

function isPrivateIpv4(hostname: string): boolean {
	const parts = hostname.split(".").map((part) => Number.parseInt(part, 10));
	if (
		parts.length !== 4 ||
		parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
	) {
		return false;
	}
	const [first, second] = parts;
	return (
		first === 0 ||
		first === 10 ||
		first === 127 ||
		first === 169 ||
		(first === 100 && second !== undefined && second >= 64 && second <= 127) ||
		(first === 192 && second === 168) ||
		(first === 192 && second === 0) ||
		(first === 192 && second === 2) ||
		(first === 198 && (second === 18 || second === 19 || second === 51)) ||
		(first === 203 && second === 0) ||
		(first === 172 && second !== undefined && second >= 16 && second <= 31) ||
		first >= 224
	);
}

function isUnsafeHostname(hostname: string): boolean {
	const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
	return (
		normalized === "localhost" ||
		normalized === "::" ||
		normalized === "::1" ||
		normalized.startsWith("::ffff:") ||
		normalized.startsWith("fe80:") ||
		normalized.startsWith("fc") ||
		normalized.startsWith("fd") ||
		normalized.startsWith("2001:db8:") ||
		normalized.endsWith(".local") ||
		normalized.endsWith(".internal") ||
		isPrivateIpv4(normalized)
	);
}

export function validateUpstreamUrl(
	value: string,
	allowPrivateNetwork: boolean,
): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new GatewayError(
			400,
			"INVALID_UPSTREAM_URL",
			"Enter a valid upstream URL.",
		);
	}

	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new GatewayError(
			400,
			"INVALID_UPSTREAM_URL",
			"Only HTTP and HTTPS upstream URLs are supported.",
		);
	}
	if (url.username || url.password || url.hash) {
		throw new GatewayError(
			400,
			"INVALID_UPSTREAM_URL",
			"Upstream URLs cannot contain credentials or fragments.",
		);
	}
	if (!allowPrivateNetwork && isUnsafeHostname(url.hostname)) {
		throw new GatewayError(
			400,
			"PRIVATE_UPSTREAM_BLOCKED",
			"Private and local upstreams require the explicit advanced opt-in.",
		);
	}
	return url;
}

export function appendUpstreamPath(
	baseUrl: string,
	incomingPath: string,
	search: string,
): URL {
	const base = validateUpstreamUrl(baseUrl, true);
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
			if (decoded.includes("\0")) {
				return true;
			}
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
