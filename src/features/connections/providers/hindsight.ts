import { createApiKeyProvider } from "./factories";
import type { ProviderDefinition } from "./types";

export const hindsight: ProviderDefinition = createApiKeyProvider({
	slug: "hindsight",
	nameKey: "providers_hindsight_name",
	descriptionKey: "providers_hindsight_description",
	baseUrl: "https://api.hindsight.vectorize.io",
	testPath: "/v1/default/banks",
	icon: { kind: "generic" },
	keyName: "Authorization",
	keyPrefix: "Bearer",
});

export const hindsightProviders: readonly ProviderDefinition[] = [hindsight];
