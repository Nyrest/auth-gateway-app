const loopbackAuthHosts = ["localhost:*", "127.0.0.1:*"] as const;

/**
 * Resolves Better Auth's request URL only from the installed public host or a
 * loopback development host. Better Auth derives trusted origins from this
 * allowlist, including HTTP for the loopback entries.
 */
export function createAuthBaseUrl(publicOrigin: string) {
	return {
		allowedHosts: [new URL(publicOrigin).host, ...loopbackAuthHosts],
		protocol: "auto" as const,
	};
}
