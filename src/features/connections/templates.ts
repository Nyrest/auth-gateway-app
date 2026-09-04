/** Backwards-compatible exports for callers that have not moved to registry.ts. */
import { githubOauthEndpoints } from "./providers/github";
import {
	getProviderDefinition,
	listProviderDefinitions,
	providerRegistry,
} from "./providers/registry";
import type { ProviderTemplate } from "./providers/types";

export type {
	ProviderDefinition,
	ProviderField,
	ProviderFieldType,
	ProviderTemplate,
} from "./providers/types";

/** Keep server functions serializable: runtime hooks and icon components never cross the boundary. */
export function toProviderTemplate(
	provider: (typeof providerRegistry)[number],
): ProviderTemplate {
	return {
		slug: provider.slug,
		category: provider.category,
		icon: { kind: provider.icon.kind },
		defaultBaseUrl: provider.defaultBaseUrl,
		protocol: provider.protocol,
		fields: provider.fields,
		metadata: provider.metadata,
		capabilities: provider.capabilities,
		...(provider.oauthEndpoints
			? { oauthEndpoints: provider.oauthEndpoints }
			: {}),
		...(provider.defaultScopes
			? { defaultScopes: provider.defaultScopes }
			: {}),
		...(provider.auth ? { auth: provider.auth } : {}),
		...(provider.fixedHeaders ? { fixedHeaders: provider.fixedHeaders } : {}),
		...(provider.fixedQuery ? { fixedQuery: provider.fixedQuery } : {}),
		...(provider.pathPrefix ? { pathPrefix: provider.pathPrefix } : {}),
		...(provider.mcp ? { mcp: provider.mcp } : {}),
		...(provider.verification ? { verification: provider.verification } : {}),
	};
}

export const providerTemplates: readonly ProviderTemplate[] =
	providerRegistry.map(toProviderTemplate);

export function getProviderTemplate(slug: string) {
	return getProviderDefinition(slug);
}

export function getOAuthEndpoints(templateSlug: string) {
	const provider = getProviderDefinition(templateSlug);
	if (provider?.oauthEndpoints) return provider.oauthEndpoints;
	if (templateSlug === "github_oauth") return githubOauthEndpoints;
	return null;
}

export { listProviderDefinitions };
