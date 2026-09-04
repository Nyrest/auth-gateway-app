import Cloudflare from "@thesvg/react/cloudflare";

import { createApiKeyProvider } from "./factories";
import type { ProviderDefinition } from "./types";

export const cloudflare: ProviderDefinition = createApiKeyProvider({
	slug: "cloudflare",
	nameKey: "providers_cloudflare_name",
	descriptionKey: "providers_cloudflare_description",
	baseUrl: "https://api.cloudflare.com/client/v4",
	testPath: "/user/tokens/verify",
	icon: { kind: "brand", component: Cloudflare },
});

export const cloudflareProviders: readonly ProviderDefinition[] = [cloudflare];
