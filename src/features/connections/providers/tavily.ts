import Tavily from "@thesvg/react/tavily";

import { baseUrlField } from "./common";
import { apiKeyField } from "./factories";
import type { ProviderDefinition } from "./types";

export const tavily: ProviderDefinition = {
	slug: "tavily",
	category: "predefined",
	icon: { kind: "brand", component: Tavily },
	defaultBaseUrl: "https://api.tavily.com",
	protocol: "headers",
	auth: { kind: "json_api_key", field: "api_key", name: "api_key" },
	capabilities: { test: false },
	metadata: {
		nameKey: "providers_tavily_name",
		descriptionKey: "providers_tavily_description",
	},
	fields: [baseUrlField, apiKeyField()],
};

export const tavilyProviders: readonly ProviderDefinition[] = [tavily];
