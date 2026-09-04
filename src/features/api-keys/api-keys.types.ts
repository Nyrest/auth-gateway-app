export const apiKeyPermissions = [
	"proxy",
	"connections:read",
	"connections:write",
	"api_keys:read",
	"api_keys:write",
	"audit:read",
	"statistics:read",
	"settings:read",
	"settings:write",
] as const;

export type ApiKeyPermission = (typeof apiKeyPermissions)[number];
export type ApiKeyProviderScopeMode = "all" | "selected";
export type ApiKeyPolicy = {
	readonly permissions: readonly ApiKeyPermission[];
	readonly providerScopeMode: ApiKeyProviderScopeMode;
	readonly providerSlugs: readonly string[];
	readonly instanceIds: readonly string[];
	readonly expiresAt: Date | null;
};

export type ApiKeyView = {
	readonly id: string;
	readonly label: string;
	readonly prefix: string;
	readonly permissions: readonly ApiKeyPermission[];
	readonly providerScopeMode: ApiKeyProviderScopeMode;
	readonly providerSlugs: readonly string[];
	readonly instanceIds: readonly string[];
	readonly expiresAt: Date | null;
	readonly revokedAt: Date | null;
	readonly lastUsedAt: Date | null;
	readonly createdAt: Date;
};

export type CreatedApiKey = ApiKeyView & { readonly secret: string };

export type ApiKeyStatus = "active" | "expired" | "revoked";
export type ApiKeySortKey = "prefix" | "label" | "expiresAt" | "status";
export type ApiKeysQueryInput = {
	readonly search?: string;
	readonly permission?: ApiKeyPermission;
	readonly status?: "all" | ApiKeyStatus;
	readonly page?: number;
	readonly pageSize?: number;
	readonly sort?: ApiKeySortKey;
	readonly direction?: "asc" | "desc";
};
export type ApiKeyListResult = {
	readonly items: readonly ApiKeyView[];
	readonly total: number;
	readonly page: number;
	readonly pageSize: number;
	readonly pageCount: number;
};
