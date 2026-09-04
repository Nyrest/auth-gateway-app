import {
	genericBasic,
	genericBearer,
	genericHeaders,
	genericOauth2,
	genericOidc,
} from "./generic";
import { githubOauth } from "./github";
import { googleOauth } from "./google";
import { microsoftEntraOauth } from "./microsoft-entra";
import type { ProviderDefinition } from "./types";

export const providerRegistry: readonly ProviderDefinition[] = [
	genericOidc,
	genericOauth2,
	genericBasic,
	genericBearer,
	genericHeaders,
	googleOauth,
	microsoftEntraOauth,
	githubOauth,
];

export function getProviderDefinition(
	slug: string,
): ProviderDefinition | undefined {
	return providerRegistry.find((provider) => provider.slug === slug);
}

export function listProviderDefinitions(): readonly ProviderDefinition[] {
	return providerRegistry;
}
