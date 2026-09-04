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

/** Keep server functions serializable: runtime hooks never cross the boundary. */
export function toProviderTemplate(
	provider: (typeof providerRegistry)[number],
): ProviderTemplate {
	return {
		slug: provider.slug,
		category: provider.category,
		icon: provider.icon,
		defaultBaseUrl: provider.defaultBaseUrl,
		protocol: provider.protocol,
		fields: provider.fields,
		metadata: provider.metadata,
		capabilities: provider.capabilities,
		...(provider.oauthEndpoints
			? { oauthEndpoints: provider.oauthEndpoints }
			: {}),
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
