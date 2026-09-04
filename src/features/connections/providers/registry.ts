import { anthropicProviders } from "./anthropic";
import { cloudflareProviders } from "./cloudflare";
import { elevenlabsProviders } from "./elevenlabs";
import { genericProviders } from "./generic";
import { githubProviders } from "./github";
import { googleProviders } from "./google";
import { hindsightProviders } from "./hindsight";
import { microsoftProviders } from "./microsoft-entra";
import { n8nProviders } from "./n8n";
import { notionProviders } from "./notion";
import { openaiProviders } from "./openai";
import { siyuanProviders } from "./siyuan";
import { slackProviders } from "./slack";
import { steamProviders } from "./steam";
import { tavilyProviders } from "./tavily";
import { telegramProviders } from "./telegram";
import { ticktickProviders } from "./ticktick";
import type { ProviderDefinition } from "./types";

/** The single composition point for built-in and generic connection providers. */
export const providerRegistry: readonly ProviderDefinition[] = [
	...genericProviders,
	...elevenlabsProviders,
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
	...siyuanProviders,
	...steamProviders,
	...ticktickProviders,
	...hindsightProviders,
	...n8nProviders,
];

export function getProviderDefinition(
	slug: string,
): ProviderDefinition | undefined {
	return providerRegistry.find((provider) => provider.slug === slug);
}

export function listProviderDefinitions(): readonly ProviderDefinition[] {
	return providerRegistry;
}
