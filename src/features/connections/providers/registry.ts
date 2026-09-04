import { anthropicProviders } from "./anthropic";
import { cloudflareProviders } from "./cloudflare";
import { genericProviders } from "./generic";
import { githubProviders } from "./github";
import { googleProviders } from "./google";
import { microsoftProviders } from "./microsoft-entra";
import { notionProviders } from "./notion";
import { openaiProviders } from "./openai";
import { slackProviders } from "./slack";
import { tavilyProviders } from "./tavily";
import { telegramProviders } from "./telegram";
import type { ProviderDefinition } from "./types";

/** The single composition point for built-in and generic connection providers. */
export const providerRegistry: readonly ProviderDefinition[] = [
	...genericProviders,
	...googleProviders,
	...microsoftProviders,
	...githubProviders,
	...openaiProviders,
	...anthropicProviders,
	...slackProviders,
	...cloudflareProviders,
	...telegramProviders,
	...notionProviders,
	...tavilyProviders,
];

export function getProviderDefinition(
	slug: string,
): ProviderDefinition | undefined {
	return providerRegistry.find((provider) => provider.slug === slug);
}

export function listProviderDefinitions(): readonly ProviderDefinition[] {
	return providerRegistry;
}
