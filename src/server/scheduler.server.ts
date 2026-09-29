import { and, eq, inArray, isNull, lt, lte, or } from "drizzle-orm";

import { getDb } from "#/db/index.server";
import {
	appSettings,
	oauthStates,
	providerInstances,
	userSettings,
} from "#/db/schema";
import { verifyConnection } from "#/features/connections/connection-actions.server";
import { refreshOAuthConnection } from "#/features/connections/oauth.server";
import type { RuntimeServices } from "#/runtime/contract.server";
import { runWithRuntimeContext } from "#/server/request-runtime.server";

const LEASE_MS = 9 * 60_000;
// One network job per ten-minute tick keeps the default inside the Workers Free
// 10 ms CPU budget while still providing a predictable daily refresh cadence.
const MAX_JOBS_PER_TICK = 1;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60_000;
const MAX_CLEANUP_ROWS_PER_TICK = 500;

export type SchedulerResult = {
	readonly cleanupRan: boolean;
	readonly healthChecks: number;
	readonly refreshes: number;
	readonly skipped: boolean;
};

async function claimScheduler(now: Date): Promise<Date | undefined> {
	const leaseUntil = new Date(now.getTime() + LEASE_MS);
	const [claimed] = await getDb()
		.update(appSettings)
		.set({
			schedulerLeaseUntil: leaseUntil,
			updatedAt: now,
		})
		.where(
			and(
				eq(appSettings.id, "primary"),
				or(
					isNull(appSettings.schedulerLeaseUntil),
					lt(appSettings.schedulerLeaseUntil, now),
				),
			),
		)
		.returning({ id: appSettings.id });
	return claimed ? leaseUntil : undefined;
}

async function claimRefreshJob(now: Date) {
	const [candidate] = await getDb()
		.select({ id: providerInstances.id, userId: providerInstances.userId })
		.from(providerInstances)
		.where(
			and(
				eq(providerInstances.enabled, true),
				eq(providerInstances.status, "active"),
				lte(providerInstances.refreshDueAt, now),
				or(
					isNull(providerInstances.refreshLeaseUntil),
					lt(providerInstances.refreshLeaseUntil, now),
				),
			),
		)
		.orderBy(providerInstances.refreshDueAt)
		.limit(1);
	if (!candidate) return undefined;
	const leaseUntil = new Date(now.getTime() + LEASE_MS);
	const [claimed] = await getDb()
		.update(providerInstances)
		.set({ refreshLeaseUntil: leaseUntil, updatedAt: now })
		.where(
			and(
				eq(providerInstances.id, candidate.id),
				or(
					isNull(providerInstances.refreshLeaseUntil),
					lt(providerInstances.refreshLeaseUntil, now),
				),
			),
		)
		.returning({ id: providerInstances.id, userId: providerInstances.userId });
	return claimed ? { ...claimed, leaseUntil } : undefined;
}

async function claimHealthJob(now: Date) {
	const [candidate] = await getDb()
		.select({ id: providerInstances.id, userId: providerInstances.userId })
		.from(providerInstances)
		.innerJoin(userSettings, eq(providerInstances.userId, userSettings.userId))
		.where(
			and(
				eq(providerInstances.enabled, true),
				eq(userSettings.healthChecksEnabled, true),
				lte(providerInstances.healthDueAt, now),
				or(
					isNull(providerInstances.healthLeaseUntil),
					lt(providerInstances.healthLeaseUntil, now),
				),
			),
		)
		.orderBy(providerInstances.healthDueAt)
		.limit(1);
	if (!candidate) return undefined;
	const leaseUntil = new Date(now.getTime() + LEASE_MS);
	const [claimed] = await getDb()
		.update(providerInstances)
		.set({ healthLeaseUntil: leaseUntil, updatedAt: now })
		.where(
			and(
				eq(providerInstances.id, candidate.id),
				or(
					isNull(providerInstances.healthLeaseUntil),
					lt(providerInstances.healthLeaseUntil, now),
				),
			),
		)
		.returning({ id: providerInstances.id, userId: providerInstances.userId });
	return claimed ? { ...claimed, leaseUntil } : undefined;
}

async function releaseRefreshJob(
	instanceId: string,
	leaseUntil: Date,
	now: Date,
): Promise<void> {
	await getDb()
		.update(providerInstances)
		.set({ refreshLeaseUntil: null, updatedAt: now })
		.where(
			and(
				eq(providerInstances.id, instanceId),
				eq(providerInstances.refreshLeaseUntil, leaseUntil),
			),
		);
}

async function releaseHealthJob(
	instanceId: string,
	leaseUntil: Date,
	now: Date,
): Promise<void> {
	await getDb()
		.update(providerInstances)
		.set({ healthLeaseUntil: null, updatedAt: now })
		.where(
			and(
				eq(providerInstances.id, instanceId),
				eq(providerInstances.healthLeaseUntil, leaseUntil),
			),
		);
}

async function runMaintenance(now: Date): Promise<SchedulerResult> {
	const schedulerLeaseUntil = await claimScheduler(now);
	if (!schedulerLeaseUntil) {
		return { cleanupRan: false, healthChecks: 0, refreshes: 0, skipped: true };
	}
	let refreshes = 0;
	let healthChecks = 0;
	try {
		for (let index = 0; index < MAX_JOBS_PER_TICK; index += 1) {
			const refresh = await claimRefreshJob(now);
			if (!refresh) break;
			try {
				await refreshOAuthConnection(
					refresh.id,
					refresh.userId,
					refresh.leaseUntil,
				);
			} catch {
				// Keep the lease bounded and allow the next tick to retry this job.
			} finally {
				await releaseRefreshJob(refresh.id, refresh.leaseUntil, now);
			}
			refreshes += 1;
		}
		for (let index = refreshes; index < MAX_JOBS_PER_TICK; index += 1) {
			const health = await claimHealthJob(now);
			if (!health) break;
			try {
				await verifyConnection(health.userId, health.id, health.leaseUntil);
			} catch {
				// Keep the lease bounded and allow the next tick to retry this job.
			} finally {
				await releaseHealthJob(health.id, health.leaseUntil, now);
			}
			healthChecks += 1;
		}
		const [settings] = await getDb()
			.select()
			.from(appSettings)
			.where(eq(appSettings.id, "primary"))
			.limit(1);
		const cleanupDue =
			!settings?.maintenanceCleanupDueAt ||
			settings.maintenanceCleanupDueAt <= now;
		if (cleanupDue) {
			const expiredOAuthStateIds = getDb()
				.select({ id: oauthStates.id })
				.from(oauthStates)
				.where(lt(oauthStates.expiresAt, now))
				.orderBy(oauthStates.expiresAt)
				.limit(MAX_CLEANUP_ROWS_PER_TICK);
			const deletedOAuthStates = await getDb()
				.delete(oauthStates)
				.where(inArray(oauthStates.id, expiredOAuthStateIds))
				.returning({ id: oauthStates.id });
			const cleanupHasBacklog =
				deletedOAuthStates.length === MAX_CLEANUP_ROWS_PER_TICK;
			await getDb()
				.update(appSettings)
				.set({
					maintenanceCleanupDueAt: new Date(
						now.getTime() + (cleanupHasBacklog ? 0 : CLEANUP_INTERVAL_MS),
					),
					updatedAt: now,
				})
				.where(eq(appSettings.id, "primary"));
		}
		return { cleanupRan: cleanupDue, healthChecks, refreshes, skipped: false };
	} finally {
		await getDb()
			.update(appSettings)
			.set({ schedulerLeaseUntil: null, updatedAt: now })
			.where(
				and(
					eq(appSettings.id, "primary"),
					eq(appSettings.schedulerLeaseUntil, schedulerLeaseUntil),
				),
			);
	}
}

export async function runScheduledMaintenance(
	services: RuntimeServices,
	now = new Date(),
	deferPromise: (promise: Promise<void>) => void = (promise) => {
		void promise;
	},
): Promise<SchedulerResult> {
	return runWithRuntimeContext(services, { clientIp: null, deferPromise }, () =>
		runMaintenance(now),
	);
}
