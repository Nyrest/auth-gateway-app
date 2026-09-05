export type ApiKeyProviderScopeMode = "all" | "selected";
export type ApiKeyPolicy = {
	readonly providerScopeMode: ApiKeyProviderScopeMode;
	readonly providerSlugs: readonly string[];
	readonly instanceIds: readonly string[];
	readonly expiresAt: Date | null;
};

export type ApiKeyView = {
	readonly id: string;
	readonly label: string;
	readonly prefix: string;
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
