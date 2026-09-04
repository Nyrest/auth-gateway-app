import Siyuan from "@thesvg/react/siyuan";

import { createApiKeyProvider } from "./factories";
import type { ProviderDefinition } from "./types";

const siyuanIcon = {
	kind: "brand",
	component: Siyuan,
	variant: "default",
} as const;

export const siyuan: ProviderDefinition = createApiKeyProvider({
	slug: "siyuan",
	nameKey: "providers_siyuan_name",
	descriptionKey: "providers_siyuan_description",
	baseUrl: "http://127.0.0.1:6806",
	testPath: "/api/system/getVersion",
	icon: siyuanIcon,
	keyName: "Authorization",
	keyPrefix: "Token",
	verification: {
		method: "POST",
		path: "/api/system/getVersion",
		body: {},
	},
});

export const siyuanProviders: readonly ProviderDefinition[] = [siyuan];
