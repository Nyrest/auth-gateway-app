import Anthropic from "@thesvg/react/anthropic";

import { createApiKeyProvider } from "./factories";
import type { ProviderDefinition } from "./types";

export const anthropic: ProviderDefinition = createApiKeyProvider({
	slug: "anthropic",
	nameKey: "providers_anthropic_name",
	descriptionKey: "providers_anthropic_description",
	baseUrl: "https://api.anthropic.com",
	testPath: "/v1/models",
	icon: {
		kind: "brand",
		component: Anthropic,
		light: Anthropic,
		dark: Anthropic,
	},
	keyName: "x-api-key",
	fixedHeaders: { "anthropic-version": "2023-06-01" },
});

export const anthropicProviders: readonly ProviderDefinition[] = [anthropic];
