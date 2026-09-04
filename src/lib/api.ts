import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
	listApiKeyScopeOptionsForUser,
	listApiKeysForUser,
} from "#/features/api-keys/api-keys.functions";
import type {
	ApiKeyListResult,
	ApiKeyPermission,
} from "#/features/api-keys/api-keys.types";
import {
	getConnectionDetailsForUser,
	listConnectionsForUser,
	listProviderTemplates,
} from "#/features/connections/connections.functions";
import {
	listStatisticsFiltersForUser,
	listStatisticsRequestsForUser,
	listStatisticsSummaryForUser,
	queryAuditEventsForUser,
} from "#/features/observability/observability.functions";
import { getSystemSettingsForUser } from "#/features/settings/settings.functions";

export const queryKeys = {
	connections: {
		all: ["connections"] as const,
		list: () => ["connections", "list"] as const,
		detail: (id: string) => ["connections", "detail", id] as const,
	},
	providerTemplates: ["provider-templates"] as const,
	apiKeys: {
		all: ["api-keys"] as const,
		list: (input: ApiKeysQueryInput = {}) =>
			["api-keys", "list", normalizeApiKeysQueryInput(input)] as const,
		scopeOptions: () => ["api-keys", "scope-options"] as const,
	},
	audit: {
		all: ["audit-events"] as const,
		list: (input: AuditEventsQueryInput) =>
			["audit-events", "list", input] as const,
	},
	statistics: {
		all: ["statistics"] as const,
		summary: (input: StatisticsSummaryQueryInput) =>
			["statistics", "summary", input] as const,
		filters: (range: StatisticsRange) =>
			["statistics", "filters", range] as const,
		requests: (input: StatisticsRequestsQueryInput) =>
			["statistics", "requests", input] as const,
	},
	systemSettings: ["system-settings"] as const,
} as const;

export type AuditEventsQueryInput = {
	readonly page?: number;
	readonly pageSize?: number;
	readonly search?: string;
	readonly result?: "success" | "failure" | "invalid" | "degraded";
};

export type ApiKeysQueryInput = {
	readonly search?: string;
	readonly permission?: ApiKeyPermission | "all";
	readonly status?: "all" | "active" | "expired" | "revoked";
	readonly page?: number;
	readonly pageSize?: number;
	readonly sort?: "prefix" | "label" | "expiresAt" | "status";
	readonly direction?: "asc" | "desc";
};

/**
 * Keep every caller (router loader, prefetch, and component) on one canonical
 * query key and one server-function payload shape. The route uses `all` as a
 * user-facing filter value, while the API treats an omitted permission as no
 * filter.
 */
export type NormalizedApiKeysQueryInput = {
	readonly search: string;
	readonly permission?: ApiKeyPermission;
	readonly status: "all" | "active" | "expired" | "revoked";
	readonly page: number;
	readonly pageSize: number;
	readonly sort: "prefix" | "label" | "expiresAt" | "status";
	readonly direction: "asc" | "desc";
};

export function normalizeApiKeysQueryInput(
	input: ApiKeysQueryInput = {},
): NormalizedApiKeysQueryInput {
	return {
		search: input.search?.trim().slice(0, 120) ?? "",
		permission: input.permission === "all" ? undefined : input.permission,
		status: input.status ?? "all",
		page: Number.isFinite(input.page)
			? Math.max(0, Math.trunc(input.page as number))
			: 0,
		pageSize: Number.isFinite(input.pageSize)
			? Math.min(100, Math.max(1, Math.trunc(input.pageSize as number)))
			: 8,
		sort: input.sort ?? "prefix",
		direction: input.direction === "desc" ? "desc" : "asc",
	};
}

export type StatisticsRange = "24h" | "7d" | "30d";

export type StatisticsRequestsQueryInput = {
	readonly range: StatisticsRange;
	readonly page?: number;
	readonly pageSize?: number;
	readonly search?: string;
	readonly providerSlug?: string;
	readonly instanceId?: string;
	readonly status?: "all" | "success" | "failure";
};

export type StatisticsSummaryQueryInput = {
	readonly range: StatisticsRange;
	readonly search?: string;
	readonly providerSlug?: string;
	readonly instanceId?: string;
	readonly status?: "all" | "success" | "failure";
};

export const connectionsQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.connections.list(),
		queryFn: () => listConnectionsForUser(),
		staleTime: 15_000,
		gcTime: 300_000,
	});
export const connectionDetailsQueryOptions = (id: string) =>
	queryOptions({
		queryKey: queryKeys.connections.detail(id),
		queryFn: () => getConnectionDetailsForUser({ data: { id } }),
		staleTime: 15_000,
		gcTime: 300_000,
	});
export const providerTemplatesQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.providerTemplates,
		queryFn: () => listProviderTemplates(),
		gcTime: Number.POSITIVE_INFINITY,
		staleTime: Number.POSITIVE_INFINITY,
	});
export const apiKeysQueryOptions = (input: ApiKeysQueryInput = {}) =>
	(() => {
		const normalized = normalizeApiKeysQueryInput(input);
		return queryOptions({
			queryKey: queryKeys.apiKeys.list(normalized),
			queryFn: async (): Promise<ApiKeyListResult> =>
				listApiKeysForUser({ data: normalized }) as Promise<ApiKeyListResult>,
			staleTime: 30_000,
			gcTime: 300_000,
			placeholderData: keepPreviousData,
		});
	})();

export const apiKeyScopeOptions = () =>
	queryOptions({
		queryKey: queryKeys.apiKeys.scopeOptions(),
		queryFn: () => listApiKeyScopeOptionsForUser(),
		staleTime: 30_000,
		gcTime: 300_000,
	});
export const auditEventsQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.audit.list({ page: 1, pageSize: 25 }),
		queryFn: () => queryAuditEventsForUser({ data: { page: 1, pageSize: 25 } }),
		staleTime: 30_000,
		gcTime: 300_000,
		placeholderData: keepPreviousData,
	});
export const statisticsQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.statistics.summary({ range: "24h" }),
		queryFn: () => listStatisticsSummaryForUser({ data: { range: "24h" } }),
		staleTime: 15_000,
		gcTime: 300_000,
	});

export const auditEventsPageQueryOptions = (input: AuditEventsQueryInput) =>
	queryOptions({
		queryKey: queryKeys.audit.list(input),
		queryFn: () => queryAuditEventsForUser({ data: input }),
		staleTime: 30_000,
		gcTime: 300_000,
		placeholderData: keepPreviousData,
	});

export const statisticsSummaryQueryOptions = (
	input: StatisticsSummaryQueryInput,
) =>
	queryOptions({
		queryKey: queryKeys.statistics.summary(input),
		queryFn: () => listStatisticsSummaryForUser({ data: input }),
		staleTime: 15_000,
		gcTime: 300_000,
	});

export const statisticsFiltersQueryOptions = (range: StatisticsRange) =>
	queryOptions({
		queryKey: queryKeys.statistics.filters(range),
		queryFn: () => listStatisticsFiltersForUser({ data: { range } }),
		staleTime: 15_000,
		gcTime: 300_000,
	});

export const statisticsRequestsQueryOptions = (
	input: StatisticsRequestsQueryInput,
) =>
	queryOptions({
		queryKey: queryKeys.statistics.requests(input),
		queryFn: () => listStatisticsRequestsForUser({ data: input }),
		staleTime: 15_000,
		gcTime: 300_000,
		placeholderData: keepPreviousData,
	});

export const systemSettingsQueryOptions = () =>
	queryOptions({
		queryKey: queryKeys.systemSettings,
		queryFn: () => getSystemSettingsForUser(),
		staleTime: 60_000,
		gcTime: 300_000,
	});
