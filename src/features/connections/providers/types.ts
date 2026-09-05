import type { ElementType } from "react";
import type { m } from "#/paraglide/messages.js";

/** Provider modules reference generated message keys instead of visible copy. */
export type MessageKey = keyof typeof m;
export type ProviderFieldType =
	| "string"
	| "number"
	| "boolean"
	| "json"
	| "key_value"
	| "multi_select"
	| "single_select";

/** How an outbound URL field is resolved before the system network policy runs. */
export type ProviderOutboundUrlMode = "absolute" | "relative_or_absolute";

export type ProviderFieldDefinition = {
	readonly key: string;
	readonly labelKey: MessageKey;
	readonly descriptionKey: MessageKey;
	readonly type: ProviderFieldType;
	readonly required: boolean;
	/** Secret fields are encrypted and never returned in connection config. */
	readonly secret: boolean;
	/** Outbound URLs are checked against the deployment-wide network policy. */
	readonly outboundUrl?: ProviderOutboundUrlMode;
	readonly defaultValue?: string | number | boolean | readonly string[];
	readonly options?: readonly string[];
	readonly visibleWhen?: Readonly<{ field: string; equals: string }>;
};

export type ProviderField = ProviderFieldDefinition;

export type ProviderProtocol =
	| "basic"
	| "bearer"
	| "headers"
	| "oauth2"
	| "oidc";

export type ProviderAuthStrategy =
	| {
			readonly kind: "basic";
			readonly usernameField?: string;
			readonly passwordField?: string;
	  }
	| { readonly kind: "bearer"; readonly tokenField?: string }
	| { readonly kind: "oauth_bearer" }
	| {
			readonly kind: "api_key";
			readonly field: string;
			readonly location: "header" | "query" | "path";
			readonly name?: string;
			readonly prefix?: string;
	  }
	| {
			readonly kind: "json_api_key";
			readonly field: string;
			readonly name: string;
	  }
	| { readonly kind: "none" };

export type ProviderMcpTransport = "sse" | "streamable_http";
export type ProviderMcpSessionMode = "stateless" | "stateful";

export type ProviderMcpDefinition = {
	readonly transport: ProviderMcpTransport;
	readonly sessionMode: ProviderMcpSessionMode;
};

export type ProviderCapabilities = {
	readonly connect?: boolean;
	readonly test?: boolean;
};

/** Runtime-only icon components never cross a Server Function boundary. */
export type ProviderRuntimeIconDefinition =
	| {
			readonly kind: "brand";
			readonly variant?: "default" | "mono";
			readonly component?: ElementType;
			readonly light?: ElementType;
			readonly dark?: ElementType;
	  }
	| { readonly kind: "generic" };

export type ProviderTemplate = {
	readonly slug: string;
	readonly category: "generic" | "predefined";
	readonly defaultBaseUrl: string;
	readonly protocol: ProviderProtocol;
	readonly auth?: ProviderAuthStrategy;
	readonly fixedHeaders?: Readonly<Record<string, string>>;
	readonly fixedQuery?: Readonly<Record<string, string>>;
	readonly mcp?: ProviderMcpDefinition;
	readonly fields: readonly ProviderField[];
	readonly metadata: {
		readonly nameKey: MessageKey;
		readonly descriptionKey: MessageKey;
	};
	readonly capabilities: ProviderCapabilities;
	readonly oauthEndpoints?: {
		readonly authorizationUrl: string;
		readonly tokenUrl: string;
	};
	readonly defaultScopes?: string;
	readonly verification?: {
		readonly method: "GET" | "POST";
		readonly path: string;
		readonly body?: JsonLike;
	};
};

type JsonLike =
	| string
	| number
	| boolean
	| null
	| { readonly [key: string]: JsonLike }
	| readonly JsonLike[];

export type ProviderValidator = (input: unknown) => void | Promise<void>;

/** Runtime-only definition; validation never crosses the server boundary. */
export type ProviderDefinition = ProviderTemplate & {
	readonly icon: ProviderRuntimeIconDefinition;
	readonly validate?: ProviderValidator;
};
