import { queryOptions } from "@tanstack/react-query";

import { listApiKeysForUser } from "#/features/api-keys/api-keys.functions";
import {
	listConnectionsForUser,
	listProviderTemplates,
} from "#/features/connections/connections.functions";
import {
	listAuditEventsForUser,
	listProviderStatisticsForUser,
} from "#/features/observability/observability.functions";

export const connectionsQueryOptions = () =>
	queryOptions({
		queryKey: ["connections"],
		queryFn: () => listConnectionsForUser(),
		staleTime: 30_000,
	});
export const providerTemplatesQueryOptions = () =>
	queryOptions({
		queryKey: ["provider-templates"],
		queryFn: () => listProviderTemplates(),
		staleTime: Number.POSITIVE_INFINITY,
	});
export const apiKeysQueryOptions = () =>
	queryOptions({
		queryKey: ["api-keys"],
		queryFn: () => listApiKeysForUser(),
		staleTime: 30_000,
	});
export const auditEventsQueryOptions = () =>
	queryOptions({
		queryKey: ["audit-events"],
		queryFn: () => listAuditEventsForUser(),
		staleTime: 30_000,
	});
export const statisticsQueryOptions = () =>
	queryOptions({
		queryKey: ["statistics"],
		queryFn: () => listProviderStatisticsForUser(),
		staleTime: 30_000,
	});
