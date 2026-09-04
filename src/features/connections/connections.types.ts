export type JsonValue =
	| boolean
	| null
	| number
	| string
	| JsonObject
	| JsonValue[];

export type JsonObject = { readonly [key: string]: JsonValue };

export type ConnectionView = {
	readonly id: string;
	readonly name: string;
	readonly providerSlug: string;
	readonly instanceSlug: string;
	readonly templateSlug: string;
	readonly baseUrl: string;
	readonly config: JsonObject;
	readonly status: "draft" | "connecting" | "active" | "invalid";
	readonly health: "unknown" | "healthy" | "unhealthy";
	readonly enabled: boolean;
	readonly healthIntervalMinutes: number | null;
	readonly accessTokenExpiresAt: Date | null;
	readonly refreshDueAt: Date | null;
	readonly healthDueAt: Date | null;
	readonly secretKeys: readonly string[];
	readonly policyBlocked: boolean;
	readonly createdAt: Date;
	readonly updatedAt: Date;
};

export type ConnectionDetailsView = ConnectionView & {
	readonly metrics24h: {
		readonly requests: number;
		readonly successRate: number;
		readonly p95LatencyMs: number;
	};
};

export function isJsonValue(value: unknown): value is JsonValue {
	if (
		value === null ||
		typeof value === "boolean" ||
		typeof value === "number" ||
		typeof value === "string"
	) {
		return true;
	}
	if (Array.isArray(value)) {
		return value.every((item) => isJsonValue(item));
	}
	if (!value || typeof value !== "object") {
		return false;
	}
	return Object.values(value).every((item) => isJsonValue(item));
}

export function asJsonObject(value: unknown): JsonObject {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}
	const config: Record<string, JsonValue> = {};
	for (const [key, item] of Object.entries(value)) {
		if (isJsonValue(item)) {
			config[key] = item;
		}
	}
	return config;
}
