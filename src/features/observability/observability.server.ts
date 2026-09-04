import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import { getDb } from "#/db/index.server";
import { auditEvents, providerInstances, requestMetrics } from "#/db/schema";

export type AuditResult = "success" | "failure" | "invalid" | "degraded";
export type AuditMetadata = Readonly<
	Record<string, string | number | boolean | null>
>;

export type AuditEventView = {
	readonly action: string;
	readonly id: string;
	readonly occurredAt: Date;
	readonly resourceId: string | null;
	readonly resourceType: string;
	readonly result: AuditResult;
	readonly metadata: AuditMetadata;
};

export type AuditEventPage = {
	readonly items: readonly AuditEventView[];
	readonly page: number;
	readonly pageSize: number;
	readonly total: number;
	readonly hasNextPage: boolean;
};

export type ProviderStatistic = {
	readonly averageLatencyMs: number;
	readonly failedRequests: number;
	readonly providerSlug: string;
	readonly totalRequests: number;
};

export type StatisticsProviderFilter = {
	readonly providerSlug: string;
	readonly totalRequests: number;
};

export type StatisticsInstanceFilter = {
	readonly id: string;
	readonly instanceSlug: string;
	readonly name: string;
	readonly providerSlug: string;
	readonly totalRequests: number;
};

export type StatisticsFilters = {
	readonly instances: readonly StatisticsInstanceFilter[];
	readonly providers: readonly StatisticsProviderFilter[];
};

export type StatisticsRange = "24h" | "7d" | "30d";

export type StatisticsSummary = {
	readonly range: StatisticsRange;
	readonly from: Date;
	readonly to: Date;
	readonly totalRequests: number;
	readonly failedRequests: number;
	readonly successRate: number;
	readonly averageLatencyMs: number;
	readonly p95LatencyMs: number;
	readonly healthyConnections: number;
	readonly unhealthyConnections: number;
	readonly hourly: readonly {
		readonly bucket: Date;
		readonly requests: number;
		readonly failures: number;
	}[];
	readonly topEndpoints: readonly {
		readonly path: string;
		readonly requests: number;
	}[];
	readonly topProviders: readonly ProviderStatistic[];
	readonly statusCodes: readonly {
		readonly statusCode: number;
		readonly requests: number;
	}[];
};

export type RequestMetricView = {
	readonly id: string;
	readonly instanceId: string | null;
	readonly providerSlug: string;
	readonly apiKeyId: string | null;
	readonly method: string;
	readonly path: string;
	readonly statusCode: number;
	readonly latencyMs: number;
	readonly sourceIp: string | null;
	readonly occurredAt: Date;
};

export type RequestMetricPage = {
	readonly items: readonly RequestMetricView[];
	readonly page: number;
	readonly pageSize: number;
	readonly total: number;
	readonly hasNextPage: boolean;
};

function clampPageSize(value: number | undefined, fallback: number): number {
	return Math.min(100, Math.max(1, Math.floor(value ?? fallback)));
}

function clampPage(value: number | undefined): number {
	return Math.max(1, Math.floor(value ?? 1));
}

function toAuditView(row: typeof auditEvents.$inferSelect): AuditEventView {
	return {
		action: row.action,
		id: row.id,
		occurredAt: row.occurredAt,
		resourceId: row.resourceId,
		resourceType: row.resourceType,
		result: (row.result as AuditResult) ?? "success",
		metadata:
			row.metadata &&
			typeof row.metadata === "object" &&
			!Array.isArray(row.metadata)
				? (row.metadata as AuditMetadata)
				: {},
	};
}

/** Legacy list shape used by the first dashboard implementation. */
export async function listAuditEvents(
	userId: string,
): Promise<readonly AuditEventView[]> {
	const page = await queryAuditEvents(userId, { page: 1, pageSize: 100 });
	return page.items;
}

export async function queryAuditEvents(
	userId: string,
	options: {
		readonly page?: number;
		readonly pageSize?: number;
		readonly search?: string;
		readonly result?: AuditResult;
	} = {},
): Promise<AuditEventPage> {
	const page = clampPage(options.page);
	const pageSize = clampPageSize(options.pageSize, 25);
	const filters = [eq(auditEvents.userId, userId)];
	const search = options.search?.trim();
	if (search) {
		filters.push(
			sql`(${auditEvents.action} ILIKE ${`%${search}%`} OR ${auditEvents.resourceType} ILIKE ${`%${search}%`} OR coalesce(${auditEvents.resourceId}, '') ILIKE ${`%${search}%`})`,
		);
	}
	if (options.result) filters.push(eq(auditEvents.result, options.result));
	const where = and(...filters);
	const [totalRow] = await getDb()
		.select({ count: sql<number>`count(*)::int` })
		.from(auditEvents)
		.where(where);
	const rows = await getDb()
		.select()
		.from(auditEvents)
		.where(where)
		.orderBy(desc(auditEvents.occurredAt))
		.limit(pageSize)
		.offset((page - 1) * pageSize);
	const total = Number(totalRow?.count ?? 0);
	return {
		items: rows.map(toAuditView),
		page,
		pageSize,
		total,
		hasNextPage: page * pageSize < total,
	};
}

export async function listProviderStatistics(
	userId: string,
): Promise<readonly ProviderStatistic[]> {
	const rows = await getDb()
		.select({
			averageLatencyMs: sql<number>`coalesce(round(avg(${requestMetrics.latencyMs})), 0)::int`,
			failedRequests: sql<number>`count(*) filter (where ${requestMetrics.statusCode} >= 400)::int`,
			providerSlug: requestMetrics.providerSlug,
			totalRequests: sql<number>`count(*)::int`,
		})
		.from(requestMetrics)
		.where(eq(requestMetrics.userId, userId))
		.groupBy(requestMetrics.providerSlug)
		.orderBy(desc(sql`count(*)`));
	return rows.map((row) => ({
		averageLatencyMs: Number(row.averageLatencyMs),
		failedRequests: Number(row.failedRequests),
		providerSlug: row.providerSlug,
		totalRequests: Number(row.totalRequests),
	}));
}

export async function listStatisticsFilters(
	userId: string,
	options: { readonly range?: StatisticsRange; readonly now?: Date } = {},
): Promise<StatisticsFilters> {
	const range = options.range ?? "24h";
	const to = options.now ?? new Date();
	const from = rangeStart(range, to);
	const timeFilter = and(
		eq(requestMetrics.userId, userId),
		gte(requestMetrics.occurredAt, from),
		lt(requestMetrics.occurredAt, to),
	);
	const providers = await getDb()
		.select({
			providerSlug: requestMetrics.providerSlug,
			totalRequests: sql<number>`count(*)::int`,
		})
		.from(requestMetrics)
		.where(timeFilter)
		.groupBy(requestMetrics.providerSlug)
		.orderBy(desc(sql`count(*)`));
	const instances = await getDb()
		.select({
			id: providerInstances.id,
			instanceSlug: providerInstances.instanceSlug,
			name: providerInstances.name,
			providerSlug: providerInstances.providerSlug,
			totalRequests: sql<number>`count(*)::int`,
		})
		.from(requestMetrics)
		.innerJoin(
			providerInstances,
			eq(requestMetrics.instanceId, providerInstances.id),
		)
		.where(timeFilter)
		.groupBy(
			providerInstances.id,
			providerInstances.instanceSlug,
			providerInstances.name,
			providerInstances.providerSlug,
		)
		.orderBy(desc(sql`count(*)`));
	return {
		providers: providers.map((row) => ({
			providerSlug: row.providerSlug,
			totalRequests: Number(row.totalRequests),
		})),
		instances: instances.map((row) => ({
			id: row.id,
			instanceSlug: row.instanceSlug,
			name: row.name,
			providerSlug: row.providerSlug,
			totalRequests: Number(row.totalRequests),
		})),
	};
}

function rangeStart(range: StatisticsRange, now: Date): Date {
	const hours = range === "24h" ? 24 : range === "7d" ? 24 * 7 : 24 * 30;
	return new Date(now.getTime() - hours * 60 * 60_000);
}

type StatisticsQueryFilters = {
	readonly providerSlug?: string;
	readonly instanceId?: string;
	readonly status?: "all" | "success" | "failure";
	readonly search?: string;
};

function statisticsFilters(
	userId: string,
	from: Date,
	to: Date,
	options: StatisticsQueryFilters,
) {
	const filters = [
		eq(requestMetrics.userId, userId),
		gte(requestMetrics.occurredAt, from),
		lt(requestMetrics.occurredAt, to),
	];
	if (options.providerSlug)
		filters.push(eq(requestMetrics.providerSlug, options.providerSlug));
	if (options.instanceId)
		filters.push(eq(requestMetrics.instanceId, options.instanceId));
	if (options.status === "success")
		filters.push(lt(requestMetrics.statusCode, 400));
	if (options.status === "failure")
		filters.push(gte(requestMetrics.statusCode, 400));
	const search = options.search?.trim();
	if (search) {
		filters.push(
			sql`(${requestMetrics.path} ILIKE ${`%${search}%`} OR ${requestMetrics.providerSlug} ILIKE ${`%${search}%`} OR coalesce(${requestMetrics.sourceIp}, '') ILIKE ${`%${search}%`})`,
		);
	}
	return filters;
}

export async function getStatisticsSummary(
	userId: string,
	options: {
		readonly range?: StatisticsRange;
		readonly now?: Date;
	} & StatisticsQueryFilters = {},
): Promise<StatisticsSummary> {
	const range = options.range ?? "24h";
	const to = options.now ?? new Date();
	const from = rangeStart(range, to);
	const timeFilter = and(...statisticsFilters(userId, from, to, options));
	const [totals] = await getDb()
		.select({
			totalRequests: sql<number>`count(*)::int`,
			failedRequests: sql<number>`count(*) filter (where ${requestMetrics.statusCode} >= 400)::int`,
			averageLatencyMs: sql<number>`coalesce(round(avg(${requestMetrics.latencyMs})), 0)::int`,
			// percentile_cont returns double precision in PostgreSQL; cast to
			// numeric before round() (round(double precision) is undefined).
			p95LatencyMs: sql<number>`coalesce(round((percentile_cont(0.95) within group (order by ${requestMetrics.latencyMs}))::numeric), 0)::int`,
		})
		.from(requestMetrics)
		.where(timeFilter);
	const totalRequests = Number(totals?.totalRequests ?? 0);
	const failedRequests = Number(totals?.failedRequests ?? 0);
	const [health] = await getDb()
		.select({
			healthy: sql<number>`count(*) filter (where ${providerInstances.health} = 'healthy')::int`,
			unhealthy: sql<number>`count(*) filter (where ${providerInstances.health} = 'unhealthy')::int`,
		})
		.from(providerInstances)
		.where(
			and(
				eq(providerInstances.userId, userId),
				...(options.providerSlug
					? [eq(providerInstances.providerSlug, options.providerSlug)]
					: []),
				...(options.instanceId
					? [eq(providerInstances.id, options.instanceId)]
					: []),
			),
		);
	const hourlyRows = await getDb()
		.select({
			bucket: sql<Date>`date_trunc('hour', ${requestMetrics.occurredAt})`,
			requests: sql<number>`count(*)::int`,
			failures: sql<number>`count(*) filter (where ${requestMetrics.statusCode} >= 400)::int`,
		})
		.from(requestMetrics)
		.where(timeFilter)
		.groupBy(sql`date_trunc('hour', ${requestMetrics.occurredAt})`)
		.orderBy(sql`date_trunc('hour', ${requestMetrics.occurredAt})`);
	const topEndpoints = await getDb()
		.select({ path: requestMetrics.path, requests: sql<number>`count(*)::int` })
		.from(requestMetrics)
		.where(timeFilter)
		.groupBy(requestMetrics.path)
		.orderBy(desc(sql`count(*)`))
		.limit(10);
	const topProviders = await getDb()
		.select({
			providerSlug: requestMetrics.providerSlug,
			totalRequests: sql<number>`count(*)::int`,
			failedRequests: sql<number>`count(*) filter (where ${requestMetrics.statusCode} >= 400)::int`,
			averageLatencyMs: sql<number>`coalesce(round(avg(${requestMetrics.latencyMs})), 0)::int`,
		})
		.from(requestMetrics)
		.where(timeFilter)
		.groupBy(requestMetrics.providerSlug)
		.orderBy(desc(sql`count(*)`))
		.limit(10);
	const statusCodes = await getDb()
		.select({
			statusCode: requestMetrics.statusCode,
			requests: sql<number>`count(*)::int`,
		})
		.from(requestMetrics)
		.where(timeFilter)
		.groupBy(requestMetrics.statusCode)
		.orderBy(desc(sql`count(*)`));
	const hours = range === "24h" ? 24 : range === "7d" ? 24 * 7 : 24 * 30;
	const byHour = new Map(
		hourlyRows.map((row) => [
			new Date(row.bucket).toISOString().slice(0, 13),
			row,
		]),
	);
	const hourly: StatisticsSummary["hourly"][number][] = [];
	for (let index = hours - 1; index >= 0; index -= 1) {
		const bucket = new Date(to.getTime() - index * 60 * 60_000);
		bucket.setUTCMinutes(0, 0, 0);
		const row = byHour.get(bucket.toISOString().slice(0, 13));
		hourly.push({
			bucket,
			requests: Number(row?.requests ?? 0),
			failures: Number(row?.failures ?? 0),
		});
	}
	return {
		range,
		from,
		to,
		totalRequests,
		failedRequests,
		successRate:
			totalRequests > 0 ? (totalRequests - failedRequests) / totalRequests : 1,
		averageLatencyMs: Number(totals?.averageLatencyMs ?? 0),
		p95LatencyMs: Number(totals?.p95LatencyMs ?? 0),
		healthyConnections: Number(health?.healthy ?? 0),
		unhealthyConnections: Number(health?.unhealthy ?? 0),
		hourly,
		topEndpoints: topEndpoints.map((row) => ({
			path: row.path,
			requests: Number(row.requests),
		})),
		topProviders: topProviders.map((row) => ({
			providerSlug: row.providerSlug,
			totalRequests: Number(row.totalRequests),
			failedRequests: Number(row.failedRequests),
			averageLatencyMs: Number(row.averageLatencyMs),
		})),
		statusCodes: statusCodes.map((row) => ({
			statusCode: Number(row.statusCode),
			requests: Number(row.requests),
		})),
	};
}

export async function listStatisticsRequests(
	userId: string,
	options: {
		readonly range?: StatisticsRange;
		readonly page?: number;
		readonly pageSize?: number;
		readonly now?: Date;
	} & StatisticsQueryFilters = {},
): Promise<RequestMetricPage> {
	const page = clampPage(options.page);
	const pageSize = clampPageSize(options.pageSize, 20);
	const to = options.now ?? new Date();
	const from = rangeStart(options.range ?? "24h", to);
	const filters = statisticsFilters(userId, from, to, options);
	const where = and(...filters);
	const [totalRow] = await getDb()
		.select({ count: sql<number>`count(*)::int` })
		.from(requestMetrics)
		.where(where);
	const rows = await getDb()
		.select()
		.from(requestMetrics)
		.where(where)
		.orderBy(desc(requestMetrics.occurredAt))
		.limit(pageSize)
		.offset((page - 1) * pageSize);
	const total = Number(totalRow?.count ?? 0);
	return {
		items: rows.map((row) => ({
			id: row.id,
			instanceId: row.instanceId,
			providerSlug: row.providerSlug,
			apiKeyId: row.apiKeyId,
			method: row.method,
			path: row.path,
			statusCode: row.statusCode,
			latencyMs: row.latencyMs,
			sourceIp: row.sourceIp,
			occurredAt: row.occurredAt,
		})),
		page,
		pageSize,
		total,
		hasNextPage: page * pageSize < total,
	};
}
