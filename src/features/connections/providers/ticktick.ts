import Ticktick from "@thesvg/react/ticktick";

import { mcpBaseFields, stringField } from "./common";
import { createApiKeyProvider, createMcpProvider } from "./factories";
import { createOidcProvider, oauthFields } from "./oidc";
import type { ProviderDefinition } from "./types";

const ticktickBaseUrl = "https://api.ticktick.com/open/v1";
const ticktickMcpUrl = "https://mcp.ticktick.com";
const ticktickIcon = { kind: "brand", component: Ticktick } as const;
const ticktickOauthEndpoints = {
	authorizationUrl: "https://ticktick.com/oauth/authorize",
	tokenUrl: "https://api.ticktick.com/oauth/token",
} as const;

export const ticktick: ProviderDefinition = createApiKeyProvider({
	slug: "ticktick",
	nameKey: "providers_ticktick_name",
	descriptionKey: "providers_ticktick_description",
	baseUrl: ticktickBaseUrl,
	testPath: "/project",
	icon: ticktickIcon,
	keyName: "Authorization",
	keyPrefix: "Bearer",
});

export const ticktickOauth: ProviderDefinition = {
	...createOidcProvider({
		slug: "ticktick_oauth",
		nameKey: "providers_ticktick_oauth_name",
		descriptionKey: "providers_ticktick_oauth_description",
		category: "predefined",
		icon: ticktickIcon,
		defaultBaseUrl: ticktickBaseUrl,
		fields: oauthFields(),
		protocol: "oauth2",
		endpoints: ticktickOauthEndpoints,
		defaultScopes: "tasks:read tasks:write",
	}),
	verification: { method: "GET", path: "/project" },
};

const ticktickMcpTokenField = stringField("token", "provider_field_token", {
	required: true,
	secret: true,
});

export const ticktickMcp: ProviderDefinition = createMcpProvider({
	slug: "ticktick_mcp",
	nameKey: "providers_ticktick_mcp_name",
	descriptionKey: "providers_ticktick_mcp_description",
	baseUrl: ticktickMcpUrl,
	auth: { kind: "bearer", tokenField: "token" },
	icon: ticktickIcon,
	fields: [...mcpBaseFields, ticktickMcpTokenField],
});

export const ticktickMcpOauth: ProviderDefinition = {
	slug: "ticktick_mcp_oauth",
	category: "predefined",
	icon: ticktickIcon,
	defaultBaseUrl: ticktickMcpUrl,
	protocol: "oauth2",
	auth: { kind: "oauth_bearer" },
	mcp: { transport: "streamable_http", sessionMode: "stateless" },
	capabilities: { connect: true, test: true },
	metadata: {
		nameKey: "providers_ticktick_mcp_oauth_name",
		descriptionKey: "providers_ticktick_mcp_oauth_description",
	},
	fields: [
		...mcpBaseFields,
		stringField("client_id", "provider_field_client_id", {
			required: true,
			secret: false,
		}),
		stringField("client_secret", "provider_field_client_secret", {
			required: true,
			secret: true,
		}),
		stringField("scopes", "provider_field_scopes", {
			required: false,
			secret: false,
		}),
	],
	oauthEndpoints: ticktickOauthEndpoints,
	defaultScopes: "tasks:read tasks:write",
	verification: { method: "POST", path: "" },
};

export const ticktickProviders: readonly ProviderDefinition[] = [
	ticktick,
	ticktickOauth,
	ticktickMcp,
	ticktickMcpOauth,
];
