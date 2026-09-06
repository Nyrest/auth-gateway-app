/** Recognize loopback hosts for local public-origin handling. */
export function isAlwaysAllowedLoopbackHost(hostname: string): boolean {
	const normalized = hostname
		.toLowerCase()
		.replace(/^\[|\]$/g, "")
		.replace(/\.$/, "");
	return normalized === "localhost" || normalized === "127.0.0.1";
}
