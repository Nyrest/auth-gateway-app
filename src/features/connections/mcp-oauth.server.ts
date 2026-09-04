import { validateConfiguredUpstreamUrl } from "#/server/upstream-url.server";

export type McpProtectedResourceMetadata = {
	readonly resource: string;
	readonly authorizationServers: readonly string[];
};

export function parseProtectedResourceMetadata(
	value: unknown,
): McpProtectedResourceMetadata | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value))
		return undefined;
	const item = value as Record<string, unknown>;
	if (typeof item.resource !== "string") return undefined;
	const authorizationServers = Array.isArray(item.authorization_servers)
		? item.authorization_servers.filter(
				(entry): entry is string => typeof entry === "string",
			)
		: [];
	return { resource: item.resource, authorizationServers };
}

export async function discoverMcpMetadata(
	serverUrl: string,
): Promise<McpProtectedResourceMetadata | undefined> {
	const safe = await validateConfiguredUpstreamUrl(serverUrl);
	const metadataUrl = new URL(
		".well-known/oauth-protected-resource",
		`${safe.toString().replace(/\/$/, "")}/`,
	);
	const response = await fetch(
		await validateConfiguredUpstreamUrl(metadataUrl.toString()),
		{ headers: { accept: "application/json" }, redirect: "error" },
	);
	if (!response.ok) return undefined;
	return parseProtectedResourceMetadata(
		await response.json().catch(() => null),
	);
}
