import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireUser } from "#/server/auth-middleware";

import {
	getStatisticsSummary,
	listAuditEvents,
	listProviderStatistics,
	listStatisticsFilters,
	listStatisticsRequests,
	queryAuditEvents,
} from "./observability.server";

export const listAuditEventsForUser = createServerFn({ method: "GET" })
	.middleware([requireUser])
	.handler(({ context }) => listAuditEvents(context.userId));

export const queryAuditEventsForUser = createServerFn({ method: "GET" })
	.middleware([requireUser])
	.validator(
		z
			.object({
				page: z.number().int().min(1).optional(),
				pageSize: z.number().int().min(1).max(100).optional(),
				search: z.string().max(200).optional(),
				result: z
					.enum(["success", "failure", "invalid", "degraded"])
					.optional(),
			})
			.default({}),
	)
	.handler(({ context, data }) => queryAuditEvents(context.userId, data));

export const listProviderStatisticsForUser = createServerFn({ method: "GET" })
	.middleware([requireUser])
	.handler(({ context }) => listProviderStatistics(context.userId));

export const listStatisticsSummaryForUser = createServerFn({ method: "GET" })
	.middleware([requireUser])
	.validator(
		z
			.object({
				range: z.enum(["24h", "7d", "30d"]).optional(),
				search: z.string().max(200).optional(),
				providerSlug: z.string().max(80).optional(),
				instanceId: z.uuid().optional(),
				status: z.enum(["all", "success", "failure"]).optional(),
			})
			.default({}),
	)
	.handler(({ context, data }) => getStatisticsSummary(context.userId, data));

export const listStatisticsFiltersForUser = createServerFn({ method: "GET" })
	.middleware([requireUser])
	.validator(
		z.object({ range: z.enum(["24h", "7d", "30d"]).optional() }).default({}),
	)
	.handler(({ context, data }) => listStatisticsFilters(context.userId, data));

export const listStatisticsRequestsForUser = createServerFn({ method: "GET" })
	.middleware([requireUser])
	.validator(
		z
			.object({
				range: z.enum(["24h", "7d", "30d"]).optional(),
				page: z.number().int().min(1).optional(),
				pageSize: z.number().int().min(1).max(100).optional(),
				search: z.string().max(200).optional(),
				providerSlug: z.string().max(80).optional(),
				instanceId: z.uuid().optional(),
				status: z.enum(["all", "success", "failure"]).optional(),
			})
			.default({}),
	)
	.handler(({ context, data }) => listStatisticsRequests(context.userId, data));
