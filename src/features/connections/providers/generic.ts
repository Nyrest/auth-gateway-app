import ModelContextProtocol from "@thesvg/react/model-context-protocol";

import { baseUrlField, mcpBaseFields, stringField, testFields } from "./common";
import { createOidcProvider } from "./oidc";
import type {
	ProviderDefinition,
	ProviderRuntimeIconDefinition,
} from "./types";

export const genericMcpIcon = {
	kind: "brand",
	component: ModelContextProtocol,
	light: ModelContextProtocol,
	dark: ModelContextProtocol,
} satisfies ProviderRuntimeIconDefinition;

export const genericOidc = createOidcProvider({
	slug: "generic_oidc",
	nameKey: "providers_generic_oidc_name",
	descriptionKey: "providers_generic_oidc_description",
	category: "generic",
	defaultBaseUrl: "https://api.example.com",
});

export const genericOauth2: ProviderDefinition = {
	slug: "generic_oauth2",
	category: "generic",
	icon: { kind: "generic" },
	defaultBaseUrl: "https://api.example.com",
	protocol: "oauth2",
	capabilities: { connect: true, test: true },
	metadata: {
		nameKey: "providers_generic_oauth2_name",
		descriptionKey: "providers_generic_oauth2_description",
	},
	fields: [
		baseUrlField,
		stringField("client_id", "provider_field_client_id", {
			required: true,
			secret: false,
		}),
		stringField("client_secret", "provider_field_client_secret", {
			required: true,
			secret: true,
		}),
		stringField("authorization_url", "provider_field_authorization_url", {
			required: false,
			secret: false,
		}),
		stringField("token_url", "provider_field_token_url", {
			required: false,
			secret: false,
		}),
		stringField("scopes", "provider_field_scopes", {
			required: false,
			secret: false,
		}),
		{
			key: "grant_type",
			labelKey: "provider_field_grant_type",
			descriptionKey: "provider_field_grant_type_description",
			type: "single_select",
			required: false,
			secret: false,
			defaultValue: "authorization_code",
			options: ["authorization_code", "client_credentials"],
		},
		...testFields,
	],
};

export const genericBasic: ProviderDefinition = {
	slug: "generic_basic",
	category: "generic",
	icon: { kind: "generic" },
	defaultBaseUrl: "https://api.example.com",
	protocol: "basic",
	capabilities: { test: true },
	metadata: {
		nameKey: "providers_generic_basic_name",
		descriptionKey: "providers_generic_basic_description",
	},
	fields: [
		baseUrlField,
		stringField("username", "provider_field_username", {
			required: true,
			secret: true,
		}),
		stringField("password", "provider_field_password", {
			required: true,
			secret: true,
		}),
		...testFields,
	],
};

export const genericBearer: ProviderDefinition = {
	slug: "generic_bearer",
	category: "generic",
	icon: { kind: "generic" },
	defaultBaseUrl: "https://api.example.com",
	protocol: "bearer",
	capabilities: { test: true },
	metadata: {
		nameKey: "providers_generic_bearer_name",
		descriptionKey: "providers_generic_bearer_description",
	},
	fields: [
		baseUrlField,
		stringField("token", "provider_field_token", {
			required: true,
			secret: true,
		}),
		...testFields,
	],
};

export const genericHeaders: ProviderDefinition = {
	slug: "generic_headers",
	category: "generic",
	icon: { kind: "generic" },
	defaultBaseUrl: "https://api.example.com",
	protocol: "headers",
	capabilities: { test: true },
	metadata: {
		nameKey: "providers_generic_headers_name",
		descriptionKey: "providers_generic_headers_description",
	},
	fields: [baseUrlField, ...testFields],
};

function mcpFields(
	authFields: readonly ProviderDefinition["fields"][number][] = [],
) {
	return [...mcpBaseFields, ...authFields];
}

export const genericMcp: ProviderDefinition = {
	slug: "generic_mcp",
	category: "generic",
	icon: genericMcpIcon,
	defaultBaseUrl: "https://mcp.example.com/mcp",
	protocol: "headers",
	auth: { kind: "none" },
	mcp: { transport: "streamable_http", sessionMode: "stateless" },
	capabilities: { test: true },
	metadata: {
		nameKey: "providers_generic_mcp_name",
		descriptionKey: "providers_generic_mcp_description",
	},
	fields: mcpFields(),
};

export const genericMcpBasic: ProviderDefinition = {
	...genericMcp,
	slug: "generic_mcp_basic",
	auth: { kind: "basic", usernameField: "username", passwordField: "password" },
	metadata: {
		nameKey: "providers_generic_mcp_basic_name",
		descriptionKey: "providers_generic_mcp_basic_description",
	},
	fields: mcpFields([
		stringField("username", "provider_field_username", {
			required: true,
			secret: true,
		}),
		stringField("password", "provider_field_password", {
			required: true,
			secret: true,
		}),
	]),
};

export const genericMcpBearer: ProviderDefinition = {
	...genericMcp,
	slug: "generic_mcp_bearer",
	auth: { kind: "bearer", tokenField: "token" },
	metadata: {
		nameKey: "providers_generic_mcp_bearer_name",
		descriptionKey: "providers_generic_mcp_bearer_description",
	},
	fields: mcpFields([
		stringField("token", "provider_field_token", {
			required: true,
			secret: true,
		}),
	]),
};

export const genericMcpOauth: ProviderDefinition = {
	...genericMcp,
	slug: "generic_mcp_oauth",
	protocol: "oauth2",
	auth: { kind: "oauth_bearer" },
	metadata: {
		nameKey: "providers_generic_mcp_oauth_name",
		descriptionKey: "providers_generic_mcp_oauth_description",
	},
	capabilities: { connect: true, test: true },
	fields: mcpFields([
		stringField("client_id", "provider_field_client_id", {
			required: true,
			secret: false,
		}),
		stringField("client_secret", "provider_field_client_secret", {
			required: true,
			secret: true,
		}),
		stringField("authorization_url", "provider_field_authorization_url", {
			required: true,
			secret: false,
		}),
		stringField("token_url", "provider_field_token_url", {
			required: true,
			secret: false,
		}),
		stringField("scopes", "provider_field_scopes", {
			required: false,
			secret: false,
		}),
	]),
};

export const genericProviders: readonly ProviderDefinition[] = [
	genericOidc,
	genericOauth2,
	genericBasic,
	genericBearer,
	genericHeaders,
	genericMcp,
	genericMcpBasic,
	genericMcpBearer,
	genericMcpOauth,
];
