/**
 * Explicit development-loopback exception. Other private addresses remain
 * subject to the deployment-wide private-network policy.
 */
export function isAlwaysAllowedLoopbackHost(hostname: string): boolean {
	const normalized = hostname
		.toLowerCase()
		.replace(/^\[|\]$/g, "")
		.replace(/\.$/, "");
	return normalized === "localhost" || normalized === "127.0.0.1";
}
