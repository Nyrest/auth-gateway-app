import Github from "@thesvg/react/github";

import { createApiKeyProvider } from "./factories";
import { createOidcProvider, oauthFields } from "./oidc";
import type {
	ProviderDefinition,
	ProviderRuntimeIconDefinition,
} from "./types";

export const githubIcon = {
	kind: "brand",
	component: Github,
	light: Github,
	dark: Github,
} satisfies ProviderRuntimeIconDefinition;

/** GitHub uses OAuth 2.0 endpoints (it is not an OIDC discovery provider). */
export const githubOauth = {
	...createOidcProvider({
		slug: "github_oauth",
		nameKey: "providers_github_oauth_name",
		descriptionKey: "providers_github_oauth_description",
		category: "predefined",
		icon: githubIcon,
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

export const githubPersonalAccessToken: ProviderDefinition =
	createApiKeyProvider({
		slug: "github_personal_access_token",
		nameKey: "providers_github_pat_name",
		descriptionKey: "providers_github_pat_description",
		baseUrl: "https://api.github.com",
		testPath: "/user",
		icon: githubIcon,
		keyName: "Authorization",
		keyPrefix: "Bearer",
	});

export const githubApp: ProviderDefinition = createApiKeyProvider({
	slug: "github_app",
	nameKey: "providers_github_app_name",
	descriptionKey: "providers_github_app_description",
	baseUrl: "https://api.github.com",
	testPath: "/app",
	icon: githubIcon,
	keyName: "Authorization",
	keyPrefix: "Bearer",
});

export const githubAppOauth: ProviderDefinition = createOidcProvider({
	slug: "github_app_oauth",
	nameKey: "providers_github_app_oauth_name",
	descriptionKey: "providers_github_app_oauth_description",
	category: "predefined",
	icon: githubIcon,
	defaultBaseUrl: "https://api.github.com",
	fields: oauthFields(),
	protocol: "oauth2",
	endpoints: githubOauthEndpoints,
});

export const githubProviders: readonly ProviderDefinition[] = [
	githubOauth,
	githubPersonalAccessToken,
	githubApp,
	githubAppOauth,
];
