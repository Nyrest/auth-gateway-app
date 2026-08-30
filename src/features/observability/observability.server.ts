import { desc, eq, sql } from "drizzle-orm";

import { getDb } from "#/db/index.server";
import { auditEvents, requestMetrics } from "#/db/schema";

export type AuditEventView = {
	readonly action: string;
	readonly id: string;
	readonly occurredAt: Date;
	readonly resourceId: string | null;
	readonly resourceType: string;
};

export type ProviderStatistic = {
	readonly averageLatencyMs: number;
	readonly failedRequests: number;
	readonly providerSlug: string;
	readonly totalRequests: number;
};

export async function listAuditEvents(
	userId: string,
): Promise<readonly AuditEventView[]> {
	const rows = await getDb()
		.select()
		.from(auditEvents)
		.where(eq(auditEvents.userId, userId))
		.orderBy(desc(auditEvents.occurredAt))
		.limit(100);
	return rows.map((row) => ({
		action: row.action,
		id: row.id,
		occurredAt: row.occurredAt,
		resourceId: row.resourceId,
		resourceType: row.resourceType,
	}));
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
