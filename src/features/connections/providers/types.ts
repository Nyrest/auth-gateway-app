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
};

export type ProviderField = ProviderFieldDefinition;

export type ProviderProtocol =
	| "basic"
	| "bearer"
	| "headers"
	| "oauth2"
	| "oidc";

export type ProviderCapabilities = {
	readonly connect?: boolean;
	readonly test?: boolean;
	readonly refresh?: boolean;
};

export type ProviderIconDefinition =
	| { readonly kind: "brand"; readonly slug: string }
	| { readonly kind: "generic" };

export type ProviderTemplate = {
	readonly slug: string;
	readonly category: "generic" | "predefined";
	readonly icon: ProviderIconDefinition;
	readonly defaultBaseUrl: string;
	readonly protocol: ProviderProtocol;
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
};

export type ProviderValidator = (input: unknown) => void | Promise<void>;
export type ProviderConnectHandler = (...args: readonly unknown[]) => unknown;
export type ProviderTestHandler = (...args: readonly unknown[]) => unknown;
export type ProviderRefreshHandler = (...args: readonly unknown[]) => unknown;

/** Runtime-only definition; hooks are projected out before server serialization. */
export type ProviderDefinition = ProviderTemplate & {
	readonly validate?: ProviderValidator;
	readonly connect?: ProviderConnectHandler;
	readonly test?: ProviderTestHandler;
	readonly refresh?: ProviderRefreshHandler;
};
