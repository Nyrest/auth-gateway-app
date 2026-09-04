import Elevenlabs from "@thesvg/react/elevenlabs";

import { createApiKeyProvider } from "./factories";
import type { ProviderDefinition } from "./types";

const elevenlabsIcon = {
	kind: "brand",
	component: Elevenlabs,
	variant: "mono",
} as const;

export const elevenlabs: ProviderDefinition = createApiKeyProvider({
	slug: "elevenlabs",
	nameKey: "providers_elevenlabs_name",
	descriptionKey: "providers_elevenlabs_description",
	baseUrl: "https://api.elevenlabs.io",
	testPath: "/v1/models",
	icon: elevenlabsIcon,
	keyName: "xi-api-key",
});

export const elevenlabsProviders: readonly ProviderDefinition[] = [elevenlabs];
