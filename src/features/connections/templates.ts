export type ProviderFieldType =
	| "string"
	| "boolean"
	| "json"
	| "key_value"
	| "single_select";

export type ProviderField = {
	readonly key: string;
	readonly label: string;
	readonly description: string;
	readonly type: ProviderFieldType;
	readonly required: boolean;
	readonly secret: boolean;
	readonly defaultValue?: string | boolean | readonly string[];
	readonly options?: readonly string[];
};

export type ProviderTemplate = {
	readonly slug: string;
	readonly name: string;
	readonly description: string;
	readonly category: "generic" | "predefined";
	readonly defaultBaseUrl: string;
	readonly protocol: "basic" | "bearer" | "headers" | "oauth2" | "oidc";
	readonly connectable: boolean;
	readonly testable: boolean;
	readonly fields: readonly ProviderField[];
};

const baseUrl: ProviderField = {
	key: "base_url",
	label: "Target URL",
	description: "Requests are forwarded below this URL.",
	type: "string",
	required: true,
	secret: false,
};

const testFields: readonly ProviderField[] = [
	{
		key: "test_method",
		label: "Test method",
		description: "Method used to verify this connection.",
		type: "single_select",
		required: false,
		secret: false,
		defaultValue: "GET",
		options: ["GET", "POST"],
	},
	{
		key: "test_url",
		label: "Test URL",
		description: "Endpoint used to verify this connection.",
		type: "string",
		required: true,
		secret: false,
	},
	{
		key: "test_body",
		label: "Test JSON body",
		description: "Optional JSON body used only for POST credential tests.",
		type: "json",
		required: false,
		secret: false,
	},
];

function field(
	key: string,
	label: string,
	options: Pick<ProviderField, "required" | "secret"> &
		Partial<Pick<ProviderField, "description">>,
): ProviderField {
	return {
		key,
		label,
		description:
			options.description ?? `Configure ${label} for this connection.`,
		type: "string",
		required: options.required,
		secret: options.secret,
	};
}

function oauthFields(): readonly ProviderField[] {
	return [
		baseUrl,
		field("client_id", "Client ID", { required: true, secret: true }),
		field("client_secret", "Client secret", { required: true, secret: true }),
		field("scopes", "Scopes", { required: false, secret: false }),
		field("access_token", "Access token", { required: false, secret: true }),
	];
}

export const providerTemplates: readonly ProviderTemplate[] = [
	{
		slug: "generic_oidc",
		name: "Generic OIDC",
		description: "OpenID Connect with discovery, PKCE, and bearer tokens.",
		category: "generic",
		defaultBaseUrl: "https://api.example.com",
		protocol: "oidc",
		connectable: true,
		testable: true,
		fields: [
			baseUrl,
			field("issuer", "Issuer URL", { required: true, secret: true }),
			field("client_id", "Client ID", { required: true, secret: true }),
			field("client_secret", "Client secret", { required: true, secret: true }),
			field("scopes", "Scopes", { required: false, secret: false }),
			...testFields,
		],
	},
	{
		slug: "generic_oauth2",
		name: "Generic OAuth 2.0",
		description: "Authorization Code with PKCE or Client Credentials.",
		category: "generic",
		defaultBaseUrl: "https://api.example.com",
		protocol: "oauth2",
		connectable: true,
		testable: true,
		fields: [
			baseUrl,
			field("client_id", "Client ID", { required: true, secret: true }),
			field("client_secret", "Client secret", { required: true, secret: true }),
			field("authorization_url", "Authorization URL", {
				required: false,
				secret: false,
			}),
			field("token_url", "Token URL", { required: false, secret: false }),
			field("scopes", "Scopes", { required: false, secret: false }),
			{
				key: "grant_type",
				label: "Grant type",
				description: "OAuth grant used for this connection.",
				type: "single_select",
				required: false,
				secret: false,
				defaultValue: "authorization_code",
				options: ["authorization_code", "client_credentials"],
			},
			...testFields,
		],
	},
	{
		slug: "generic_basic",
		name: "Basic Auth",
		description: "Username and password authentication with custom headers.",
		category: "generic",
		defaultBaseUrl: "https://api.example.com",
		protocol: "basic",
		connectable: false,
		testable: true,
		fields: [
			baseUrl,
			field("username", "Username", { required: true, secret: true }),
			field("password", "Password", { required: true, secret: true }),
			...testFields,
		],
	},
	{
		slug: "generic_bearer",
		name: "Bearer Token",
		description: "Static bearer token authentication.",
		category: "generic",
		defaultBaseUrl: "https://api.example.com",
		protocol: "bearer",
		connectable: false,
		testable: true,
		fields: [
			baseUrl,
			field("token", "Bearer token", { required: true, secret: true }),
			...testFields,
		],
	},
	{
		slug: "generic_headers",
		name: "Custom Headers",
		description: "Forward custom evaluated headers to an upstream API.",
		category: "generic",
		defaultBaseUrl: "https://api.example.com",
		protocol: "headers",
		connectable: false,
		testable: true,
		fields: [
			baseUrl,
			{
				key: "headers",
				label: "Headers",
				description: "Additional headers sent upstream.",
				type: "key_value",
				required: false,
				secret: true,
				defaultValue: [],
			},
			...testFields,
		],
	},
	{
		slug: "google_oauth",
		name: "Google",
		description: "Google identity and API access.",
		category: "predefined",
		defaultBaseUrl: "https://www.googleapis.com",
		protocol: "oidc",
		connectable: true,
		testable: true,
		fields: oauthFields(),
	},
	{
		slug: "microsoft_entra_oauth",
		name: "Microsoft Entra",
		description: "Microsoft Graph access with Entra ID.",
		category: "predefined",
		defaultBaseUrl: "https://graph.microsoft.com/v1.0",
		protocol: "oidc",
		connectable: true,
		testable: true,
		fields: oauthFields(),
	},
	{
		slug: "github_oauth",
		name: "GitHub",
		description: "GitHub API access with OAuth 2.0.",
		category: "predefined",
		defaultBaseUrl: "https://api.github.com",
		protocol: "oauth2",
		connectable: true,
		testable: true,
		fields: oauthFields(),
	},
];

const oauthEndpoints = {
	generic_oauth2: null,
	generic_oidc: null,
	github_oauth: {
		authorizationUrl: "https://github.com/login/oauth/authorize",
		tokenUrl: "https://github.com/login/oauth/access_token",
	},
	google_oauth: {
		authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
		tokenUrl: "https://oauth2.googleapis.com/token",
	},
	microsoft_entra_oauth: {
		authorizationUrl:
			"https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
		tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
	},
} as const;

export function getProviderTemplate(
	slug: string,
): ProviderTemplate | undefined {
	return providerTemplates.find((template) => template.slug === slug);
}

export function getOAuthEndpoints(templateSlug: string) {
	return oauthEndpoints[templateSlug as keyof typeof oauthEndpoints] ?? null;
}
