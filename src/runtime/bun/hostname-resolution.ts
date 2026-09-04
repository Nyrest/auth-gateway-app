import type { HostnameResolver } from "#/runtime/contract.server";

/** Bun caches and deduplicates these lookups for a short period internally. */
export const resolveHostname: HostnameResolver = async (hostname) => {
	const records = await Bun.dns.lookup(hostname, { family: "any" });
	return [...new Set(records.map((record) => record.address))];
};
