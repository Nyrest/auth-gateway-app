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
	| { readonly kind: "custom_headers"; readonly field: string }
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
	readonly refresh?: boolean;
};

export type ProviderIconDefinition =
	| { readonly kind: "brand"; readonly variant?: "default" | "mono" }
	| { readonly kind: "generic" };

/** Runtime-only icon components; they are removed before templates cross the server boundary. */
export type ProviderRuntimeIconDefinition = ProviderIconDefinition & {
	readonly component?: ElementType;
	readonly light?: ElementType;
	readonly dark?: ElementType;
};

export type ProviderTemplate = {
	readonly slug: string;
	readonly category: "generic" | "predefined";
	readonly icon: ProviderIconDefinition;
	readonly defaultBaseUrl: string;
	readonly protocol: ProviderProtocol;
	readonly auth?: ProviderAuthStrategy;
	readonly fixedHeaders?: Readonly<Record<string, string>>;
	readonly fixedQuery?: Readonly<Record<string, string>>;
	readonly pathPrefix?: string;
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
export type ProviderConnectHandler = (...args: readonly unknown[]) => unknown;
export type ProviderTestHandler = (...args: readonly unknown[]) => unknown;
export type ProviderRefreshHandler = (...args: readonly unknown[]) => unknown;

/** Runtime-only definition; hooks are projected out before server serialization. */
export type ProviderDefinition = Omit<ProviderTemplate, "icon"> & {
	readonly icon: ProviderRuntimeIconDefinition;
	readonly validate?: ProviderValidator;
	readonly connect?: ProviderConnectHandler;
	readonly test?: ProviderTestHandler;
	readonly refresh?: ProviderRefreshHandler;
};
