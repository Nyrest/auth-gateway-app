import N8n from "@thesvg/react/n8n";

import { createApiKeyProvider } from "./factories";
import type { ProviderDefinition } from "./types";

export const n8n: ProviderDefinition = createApiKeyProvider({
	slug: "n8n",
	nameKey: "providers_n8n_name",
	descriptionKey: "providers_n8n_description",
	baseUrl: "https://your-instance.app.n8n.cloud/api/v1",
	testPath: "/workflows",
	icon: { kind: "brand", component: N8n },
	keyName: "X-N8N-API-KEY",
});

export const n8nProviders: readonly ProviderDefinition[] = [n8n];
