import Openai from "@thesvg/react/openai";

import { createApiKeyProvider } from "./factories";
import type { ProviderDefinition } from "./types";

export const openai: ProviderDefinition = createApiKeyProvider({
	slug: "openai",
	nameKey: "providers_openai_name",
	descriptionKey: "providers_openai_description",
	baseUrl: "https://api.openai.com",
	testPath: "/v1/models",
	icon: {
		kind: "brand",
		component: Openai,
		light: Openai,
		dark: Openai,
	},
	keyName: "Authorization",
	keyPrefix: "Bearer",
});

export const openaiProviders: readonly ProviderDefinition[] = [openai];
