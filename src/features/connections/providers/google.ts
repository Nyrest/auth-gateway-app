import { createOidcProvider, oauthFields } from "./oidc";

export const googleOauth = createOidcProvider({
	slug: "google_oauth",
	nameKey: "providers_google_oauth_name",
	descriptionKey: "providers_google_oauth_description",
	category: "predefined",
	icon: { kind: "brand", slug: "google" },
	defaultBaseUrl: "https://www.googleapis.com",
	fields: oauthFields(),
	endpoints: {
		authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
		tokenUrl: "https://oauth2.googleapis.com/token",
	},
});
