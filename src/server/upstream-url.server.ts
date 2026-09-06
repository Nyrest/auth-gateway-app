import { eq } from "drizzle-orm";
import { getDb } from "#/db/index.server";
import { appSettings } from "#/db/schema";
import { GatewayError } from "./errors";
import { isAlwaysAllowedLoopbackHost } from "./local-origin.server";
import { getRequestRuntime } from "./request-runtime.server";

const policyCache = new WeakMap<object, Promise<boolean>>();
const hostnameCache = new WeakMap<
	object,
	Map<string, Promise<readonly string[]>>
>();

function parseIpv4(hostname: string): readonly number[] | undefined {
	const parts = hostname.split(".");
	if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) {
		return undefined;
	}
	const numbers = parts.map(Number);
	if (numbers.some((part) => part < 0 || part > 255)) return undefined;
	return numbers;
}

function isPrivateIpv4(hostname: string): boolean {
	const parts = parseIpv4(hostname);
	if (!parts) return false;
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

function parseIpv6(hostname: string): bigint | undefined {
	const normalized = hostname
		.toLowerCase()
		.replace(/^\[|\]$/g, "")
		.split("%", 1)[0];
	if (!normalized) return undefined;
	const halves = normalized.split("::");
	if (halves.length > 2) return undefined;
	const parseGroups = (value: string): string[] | undefined => {
		if (!value) return [];
		const groups = value.split(":");
		const ipv4 = groups.at(-1);
		if (!ipv4?.includes(".")) return groups;
		const parts = parseIpv4(ipv4);
		if (!parts) return undefined;
		groups.splice(
			-1,
			1,
			((parts[0] << 8) | parts[1]).toString(16),
			((parts[2] << 8) | parts[3]).toString(16),
		);
		return groups;
	};
	const head = parseGroups(halves[0] ?? "");
	const tail = parseGroups(halves[1] ?? "");
	if (!head || !tail || head.length + tail.length > 8) return undefined;
	const zeroCount = halves.length === 2 ? 8 - head.length - tail.length : 0;
	const groups = [...head, ...Array<string>(zeroCount).fill("0"), ...tail];
	if (
		groups.length !== 8 ||
		groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))
	) {
		return undefined;
	}
	return groups.reduce(
		(result, group) => (result << 16n) | BigInt(`0x${group}`),
		0n,
	);
}

function isUnsafeIpv6(hostname: string): boolean {
	const value = parseIpv6(hostname);
	if (value === undefined) return false;
	const hasPrefix = (prefix: bigint, bits: bigint) =>
		value >> (128n - bits) === prefix;
	return (
		hasPrefix(0n, 96n) ||
		hasPrefix(0xffffn, 96n) ||
		hasPrefix(0x7en, 7n) ||
		hasPrefix(0x3fan, 10n) ||
		hasPrefix(0x3fbn, 10n) ||
		hasPrefix(0xffn, 8n) ||
		hasPrefix(0x20010db8n, 32n)
	);
}

function isUnsafeHostname(hostname: string): boolean {
	const normalized = hostname
		.toLowerCase()
		.replace(/^\[|\]$/g, "")
		.replace(/\.$/, "");
	return (
		normalized === "localhost" ||
		normalized.endsWith(".localhost") ||
		normalized.endsWith(".local") ||
		normalized.endsWith(".internal") ||
		isUnsafeIpv6(normalized) ||
		isPrivateIpv4(normalized)
	);
}

export function assertPublicDnsAddresses(
	hostname: string,
	addresses: readonly string[],
	allowPrivateNetwork = false,
): void {
	if (allowPrivateNetwork) return;
	if (addresses.length === 0) {
		throw new GatewayError(
			400,
			"UPSTREAM_DNS_UNRESOLVABLE",
			"The upstream hostname did not resolve to an address.",
			{ hostname },
		);
	}
	if (addresses.some(isUnsafeHostname)) {
		throw new GatewayError(
			400,
			"PRIVATE_UPSTREAM_BLOCKED",
			"Private and local upstreams require the explicit advanced opt-in.",
			{ hostname },
		);
	}
}

export function validateUpstreamUrl(
	value: string,
	allowPrivateNetwork = false,
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
	const isAlwaysAllowedLoopback = isAlwaysAllowedLoopbackHost(url.hostname);
	if (
		!allowPrivateNetwork &&
		!isAlwaysAllowedLoopback &&
		isUnsafeHostname(url.hostname)
	) {
		throw new GatewayError(
			400,
			"PRIVATE_UPSTREAM_BLOCKED",
			"Private and local upstreams require the explicit advanced opt-in.",
		);
	}
	if (
		url.protocol === "http:" &&
		!allowPrivateNetwork &&
		!isAlwaysAllowedLoopback
	) {
		throw new GatewayError(
			400,
			"INSECURE_UPSTREAM_BLOCKED",
			"Public upstream URLs must use HTTPS.",
		);
	}
	return url;
}

function assertPrivateHttpDestination(
	hostname: string,
	addresses: readonly string[],
): void {
	if (isUnsafeHostname(hostname)) return;
	if (addresses.length > 0 && addresses.every(isUnsafeHostname)) return;
	throw new GatewayError(
		400,
		"INSECURE_UPSTREAM_BLOCKED",
		"HTTP upstream URLs are limited to private and local destinations.",
	);
}

/** Read the deployment-wide network policy for the current request. */
export async function getAllowPrivateNetwork(): Promise<boolean> {
	const runtime = getRequestRuntime();
	const cached = policyCache.get(runtime);
	if (cached) return cached;
	const pending = readAllowPrivateNetwork();
	policyCache.set(runtime, pending);
	return pending;
}

async function readAllowPrivateNetwork(): Promise<boolean> {
	const [settings] = await getDb()
		.select({ allowPrivateNetwork: appSettings.allowPrivateNetwork })
		.from(appSettings)
		.where(eq(appSettings.id, "primary"))
		.limit(1);
	return settings?.allowPrivateNetwork ?? false;
}

export async function validateConfiguredUpstreamUrl(
	value: string,
): Promise<URL> {
	return validateOutboundUpstreamUrl(value, await getAllowPrivateNetwork());
}

export async function validateOutboundUpstreamUrl(
	value: string,
	allowPrivateNetwork = false,
): Promise<URL> {
	const url = validateUpstreamUrl(value, allowPrivateNetwork);
	if (isAlwaysAllowedLoopbackHost(url.hostname)) return url;
	const literalAddress = parseIpv4(url.hostname) || parseIpv6(url.hostname);
	if (literalAddress) {
		if (url.protocol === "http:" && allowPrivateNetwork) {
			assertPrivateHttpDestination(url.hostname, []);
		}
		return url;
	}
	const runtime = getRequestRuntime();
	let requests = hostnameCache.get(runtime);
	if (!requests) {
		requests = new Map();
		hostnameCache.set(runtime, requests);
	}
	let pending = requests.get(url.hostname);
	if (!pending) {
		pending = runtime.services.resolveHostname(url.hostname);
		requests.set(url.hostname, pending);
	}
	try {
		const addresses = await pending;
		if (url.protocol === "http:" && allowPrivateNetwork) {
			assertPrivateHttpDestination(url.hostname, addresses);
		} else {
			assertPublicDnsAddresses(url.hostname, addresses, allowPrivateNetwork);
		}
	} catch (error) {
		if (error instanceof GatewayError) throw error;
		throw new GatewayError(
			502,
			"UPSTREAM_DNS_UNAVAILABLE",
			"The upstream hostname could not be resolved safely.",
		);
	}
	return url;
}

/**
 * Append a proxy path to a URL that has already passed the request's
 * system-wide upstream policy check. Keeping validation outside this helper
 * prevents callers from accidentally opting out of the private-network guard.
 */
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
