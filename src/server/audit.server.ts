import { uuidv7 } from "uuidv7";

import { getDb } from "#/db/index.server";
import { auditEvents } from "#/db/schema";
import type { DeferredWork } from "#/runtime/contract.server";

import { getRequestRuntime } from "./request-runtime.server";

type AuditMetadata = Record<string, boolean | number | string | null>;
type AuditEvent = typeof auditEvents.$inferInsert;

const batches = new WeakMap<DeferredWork, AuditEvent[]>();

export function recordAuditEvent(input: {
	readonly action: string;
	readonly metadata?: AuditMetadata;
	readonly resourceId?: string;
	readonly resourceType: string;
	readonly userId: string;
}): void {
	const event: AuditEvent = {
		id: uuidv7(),
		userId: input.userId,
		action: input.action,
		resourceType: input.resourceType,
		resourceId: input.resourceId ?? null,
		metadata: input.metadata ?? {},
		occurredAt: new Date(),
	};
	const deferred = getRequestRuntime().deferred;
	const existing = batches.get(deferred);
	if (existing) {
		existing.push(event);
		return;
	}
	const batch = [event];
	batches.set(deferred, batch);
	deferred.defer(async () => {
		batches.delete(deferred);
		await getDb().insert(auditEvents).values(batch).onConflictDoNothing();
	});
}
