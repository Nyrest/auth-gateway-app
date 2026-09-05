import type { HostnameResolver } from "#/runtime/contract.server";
import { readJsonResponse } from "./outbound-request.server";

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
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 5_000);
	let response: Response;
	try {
		response = await fetch(url, {
			headers: { accept: "application/dns-json" },
			redirect: "error",
			signal: controller.signal,
		});
	} finally {
		clearTimeout(timeout);
	}
	if (!response.ok) {
		await response.body?.cancel().catch(() => undefined);
		throw new Error("DNS resolution failed");
	}
	const payload = (await readJsonResponse(response)) as DnsResponse;
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
