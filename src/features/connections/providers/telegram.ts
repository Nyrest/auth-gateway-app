import Telegram from "@thesvg/react/telegram";

import { createApiKeyProvider } from "./factories";
import type { ProviderDefinition } from "./types";

export const telegram: ProviderDefinition = createApiKeyProvider({
	slug: "telegram",
	nameKey: "providers_telegram_name",
	descriptionKey: "providers_telegram_description",
	baseUrl: "https://api.telegram.org",
	testPath: "/bot{api_key}/getMe",
	icon: { kind: "brand", component: Telegram },
	location: "path",
});

export const telegramProviders: readonly ProviderDefinition[] = [telegram];
