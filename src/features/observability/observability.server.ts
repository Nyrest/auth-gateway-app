import { and, asc, desc, eq, gte, lt, or, sql } from "drizzle-orm";

import { getDb } from "#/db/index.server";
import { auditEvents, providerInstances, requestMetrics } from "#/db/schema";
import {
	caseInsensitiveLike,
	filteredIntegerCount,
	hourlyBucket,
	integerAverage,
	integerCount,
} from "#/db/sql.server";

export type AuditResult = "success" | "failure" | "invalid" | "degraded";
export type AuditMetadata = Readonly<
	Record<string, string | number | boolean | null>
>;

function orCaseInsensitiveLike(
	columns: readonly Parameters<typeof caseInsensitiveLike>[0][],
	pattern: string,
) {
	return (
		or(...columns.map((column) => caseInsensitiveLike(column, pattern))) ??
		sql`0 = 1`
	);
}

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
		const pattern = `%${search}%`;
		filters.push(
			orCaseInsensitiveLike(
				[auditEvents.action, auditEvents.resourceType, auditEvents.resourceId],
				pattern,
			),
		);
	}
	if (options.result) filters.push(eq(auditEvents.result, options.result));
	const where = and(...filters);
	const [totalRow] = await getDb()
		.select({ count: integerCount() })
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
	const providersPromise = getDb()
		.select({
			providerSlug: requestMetrics.providerSlug,
			totalRequests: integerCount(),
		})
		.from(requestMetrics)
		.where(timeFilter)
		.groupBy(requestMetrics.providerSlug)
		.orderBy(desc(sql`count(*)`));
	const instancesPromise = getDb()
		.select({
			id: providerInstances.id,
			instanceSlug: providerInstances.instanceSlug,
			name: providerInstances.name,
			providerSlug: providerInstances.providerSlug,
			totalRequests: integerCount(),
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
	const [providers, instances] = await Promise.all([
		providersPromise,
		instancesPromise,
	]);
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
		const pattern = `%${search}%`;
		filters.push(
			orCaseInsensitiveLike(
				[
					requestMetrics.path,
					requestMetrics.providerSlug,
					requestMetrics.sourceIp,
				],
				pattern,
			),
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
	const bucket = hourlyBucket(requestMetrics.occurredAt);
	const totalsPromise = getDb()
		.select({
			totalRequests: integerCount(),
			failedRequests: filteredIntegerCount(gte(requestMetrics.statusCode, 400)),
			averageLatencyMs: integerAverage(requestMetrics.latencyMs),
		})
		.from(requestMetrics)
		.where(timeFilter);
	const healthPromise = getDb()
		.select({
			healthy: filteredIntegerCount(eq(providerInstances.health, "healthy")),
			unhealthy: filteredIntegerCount(
				eq(providerInstances.health, "unhealthy"),
			),
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
	const hourlyRowsPromise = getDb()
		.select({
			bucket,
			requests: integerCount(),
			failures: filteredIntegerCount(gte(requestMetrics.statusCode, 400)),
		})
		.from(requestMetrics)
		.where(timeFilter)
		.groupBy(bucket)
		.orderBy(bucket);
	const topEndpointsPromise = getDb()
		.select({ path: requestMetrics.path, requests: integerCount() })
		.from(requestMetrics)
		.where(timeFilter)
		.groupBy(requestMetrics.path)
		.orderBy(desc(sql`count(*)`))
		.limit(10);
	const topProvidersPromise = getDb()
		.select({
			providerSlug: requestMetrics.providerSlug,
			totalRequests: integerCount(),
			failedRequests: filteredIntegerCount(gte(requestMetrics.statusCode, 400)),
			averageLatencyMs: integerAverage(requestMetrics.latencyMs),
		})
		.from(requestMetrics)
		.where(timeFilter)
		.groupBy(requestMetrics.providerSlug)
		.orderBy(desc(sql`count(*)`))
		.limit(10);
	const statusCodesPromise = getDb()
		.select({
			statusCode: requestMetrics.statusCode,
			requests: integerCount(),
		})
		.from(requestMetrics)
		.where(timeFilter)
		.groupBy(requestMetrics.statusCode)
		.orderBy(desc(sql`count(*)`));
	const [
		[totals],
		[health],
		hourlyRows,
		topEndpoints,
		topProviders,
		statusCodes,
	] = await Promise.all([
		totalsPromise,
		healthPromise,
		hourlyRowsPromise,
		topEndpointsPromise,
		topProvidersPromise,
		statusCodesPromise,
	]);
	const totalRequests = Number(totals?.totalRequests ?? 0);
	const failedRequests = Number(totals?.failedRequests ?? 0);
	const [p95] = totalRequests
		? await getDb()
				.select({ latencyMs: requestMetrics.latencyMs })
				.from(requestMetrics)
				.where(timeFilter)
				.orderBy(asc(requestMetrics.latencyMs))
				.limit(1)
				.offset(Math.max(0, Math.ceil(totalRequests * 0.95) - 1))
		: [];
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
		p95LatencyMs: Number(p95?.latencyMs ?? 0),
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
		.select({ count: integerCount() })
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
