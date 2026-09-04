import Steam from "@thesvg/react/steam";

import { createApiKeyProvider } from "./factories";
import type { ProviderDefinition } from "./types";

export const steam: ProviderDefinition = createApiKeyProvider({
	slug: "steam",
	nameKey: "providers_steam_name",
	descriptionKey: "providers_steam_description",
	baseUrl: "https://api.steampowered.com",
	testPath: "/ISteamWebAPIUtil/GetSupportedAPIList/v0001/",
	icon: { kind: "brand", component: Steam },
	keyName: "x-webapi-key",
});

export const steamProviders: readonly ProviderDefinition[] = [steam];
