import { baseUrlField, stringField } from "./common";
import type {
	ProviderDefinition,
	ProviderField,
	ProviderRuntimeIconDefinition,
} from "./types";

export function apiKeyField(key = "api_key"): ProviderField {
	return stringField(key, "provider_field_api_key", {
		required: true,
		secret: true,
	});
}

export function createApiKeyProvider(input: {
	readonly slug: string;
	readonly nameKey: ProviderField["labelKey"];
	readonly descriptionKey: ProviderField["labelKey"];
	readonly baseUrl: string;
	readonly testPath: string;
	readonly icon?: ProviderRuntimeIconDefinition;
	readonly keyName?: string;
	readonly keyPrefix?: string;
	readonly location?: "header" | "query" | "path";
	readonly fixedHeaders?: Readonly<Record<string, string>>;
	readonly verification?: ProviderDefinition["verification"];
}): ProviderDefinition {
	return {
		slug: input.slug,
		category: "predefined",
		icon: input.icon ?? { kind: "generic" },
		defaultBaseUrl: input.baseUrl,
		protocol: "bearer",
		auth: {
			kind: "api_key",
			field: "api_key",
			location: input.location ?? "header",
			name: input.keyName,
			...(input.keyPrefix ? { prefix: input.keyPrefix } : {}),
		},
		fixedHeaders: input.fixedHeaders,
		capabilities: { test: true },
		metadata: { nameKey: input.nameKey, descriptionKey: input.descriptionKey },
		fields: [baseUrlField, apiKeyField()],
		verification: input.verification ?? { method: "GET", path: input.testPath },
	};
}

export function createMcpProvider(input: {
	readonly slug: string;
	readonly nameKey: ProviderField["labelKey"];
	readonly descriptionKey: ProviderField["labelKey"];
	readonly baseUrl: string;
	readonly auth: ProviderDefinition["auth"];
	readonly fields: readonly ProviderField[];
	readonly icon: ProviderRuntimeIconDefinition;
}): ProviderDefinition {
	return {
		slug: input.slug,
		category: "predefined",
		icon: input.icon,
		defaultBaseUrl: input.baseUrl,
		protocol: "headers",
		auth: input.auth,
		mcp: { transport: "streamable_http", sessionMode: "stateless" },
		capabilities: { test: true },
		metadata: { nameKey: input.nameKey, descriptionKey: input.descriptionKey },
		fields: input.fields,
		verification: { method: "POST", path: "" },
	};
}
