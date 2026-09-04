import Microsoft from "@thesvg/react/microsoft";
import { createOidcProvider, oauthFields } from "./oidc";

const microsoftIcon = {
	kind: "brand",
	component: Microsoft,
} as const;

export const microsoftEntraOauth = createOidcProvider({
	slug: "microsoft_entra_oauth",
	nameKey: "providers_microsoft_entra_oauth_name",
	descriptionKey: "providers_microsoft_entra_oauth_description",
	category: "predefined",
	icon: microsoftIcon,
	defaultBaseUrl: "https://graph.microsoft.com/v1.0",
	fields: oauthFields(),
	endpoints: {
		authorizationUrl:
			"https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
		tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
	},
});

export const microsoftProviders = [microsoftEntraOauth] as const;
