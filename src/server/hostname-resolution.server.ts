import type { HostnameResolver } from "#/runtime/contract.server";

type DnsAnswer = {
	readonly data?: unknown;
	readonly type?: unknown;
};

type DnsResponse = {
	readonly Answer?: readonly DnsAnswer[];
};

const dnsOverHttpsEndpoint = "https://cloudflare-dns.com/dns-query";

async function resolveRecord(
	hostname: string,
	type: "A" | "AAAA",
): Promise<readonly string[]> {
	const url = new URL(dnsOverHttpsEndpoint);
	url.searchParams.set("name", hostname);
	url.searchParams.set("type", type);
	const response = await fetch(url, {
		headers: { accept: "application/dns-json" },
		redirect: "error",
	});
	if (!response.ok) {
		throw new Error("DNS resolution failed");
	}
	const payload = (await response.json()) as DnsResponse;
	const expectedType = type === "A" ? 1 : 28;
	return (payload.Answer ?? []).flatMap((answer) =>
		answer.type === expectedType && typeof answer.data === "string"
			? [answer.data]
			: [],
	);
}

/** Web-standard fallback for development and edge runtimes without DNS APIs. */
export const resolveHostnameOverHttps: HostnameResolver = async (hostname) => {
	const records = await Promise.all([
		resolveRecord(hostname, "A"),
		resolveRecord(hostname, "AAAA"),
	]);
	return [...new Set(records.flat())];
};
