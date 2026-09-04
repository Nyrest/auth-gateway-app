import { createOidcProvider, oauthFields } from "./oidc";

/** GitHub uses OAuth 2.0 endpoints (it is not an OIDC discovery provider). */
export const githubOauth = {
	...createOidcProvider({
		slug: "github_oauth",
		nameKey: "providers_github_oauth_name",
		descriptionKey: "providers_github_oauth_description",
		category: "predefined",
		icon: { kind: "brand", slug: "github" },
		defaultBaseUrl: "https://api.github.com",
		fields: oauthFields(),
		endpoints: {
			authorizationUrl: "https://github.com/login/oauth/authorize",
			tokenUrl: "https://github.com/login/oauth/access_token",
		},
	}),
	protocol: "oauth2" as const,
};

export const githubOauthEndpoints = {
	authorizationUrl: "https://github.com/login/oauth/authorize",
	tokenUrl: "https://github.com/login/oauth/access_token",
} as const;
