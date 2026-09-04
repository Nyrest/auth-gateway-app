import { and, eq, inArray } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { getDb } from "#/db/index.server";
import { providerSecrets } from "#/db/schema";
import {
	createAssociatedData,
	decryptSecret,
	encryptSecret,
} from "#/server/crypto.server";

/**
 * Legacy connections stored some OAuth metadata in the encrypted field table.
 * Only callers that explicitly provide public field keys may read these values.
 */
export async function readPublicConnectionFields(
	userId: string,
	instanceId: string,
	publicFieldKeys: ReadonlySet<string>,
): Promise<Record<string, string>> {
	const values = await readPublicConnectionFieldsForInstances(userId, [
		{ id: instanceId, publicFieldKeys },
	]);
	return values.get(instanceId) ?? {};
}

export async function readPublicConnectionFieldsForInstances(
	userId: string,
	instances: readonly {
		readonly id: string;
		readonly publicFieldKeys: ReadonlySet<string>;
	}[],
): Promise<Map<string, Record<string, string>>> {
	const result = new Map<string, Record<string, string>>();
	if (instances.length === 0) return result;
	const instanceIds = instances.map((instance) => instance.id);
	const allowedByInstance = new Map(
		instances.map((instance) => [instance.id, instance.publicFieldKeys]),
	);
	const rows = await getDb()
		.select({
			envelope: providerSecrets.envelope,
			fieldKey: providerSecrets.fieldKey,
			instanceId: providerSecrets.instanceId,
		})
		.from(providerSecrets)
		.where(
			and(
				eq(providerSecrets.userId, userId),
				inArray(providerSecrets.instanceId, instanceIds),
			),
		);
	for (const row of rows) {
		if (!allowedByInstance.get(row.instanceId)?.has(row.fieldKey)) continue;
		try {
			const values = result.get(row.instanceId) ?? {};
			values[row.fieldKey] = await decryptSecret(
				row.envelope,
				createAssociatedData(userId, row.instanceId, row.fieldKey),
			);
			result.set(row.instanceId, values);
		} catch {
			// Keep a malformed legacy value from preventing the connection list from rendering.
		}
	}
	return result;
}

export async function readConnectionSecrets(
	userId: string,
	instanceId: string,
): Promise<Map<string, string>> {
	const rows = await getDb()
		.select({
			envelope: providerSecrets.envelope,
			fieldKey: providerSecrets.fieldKey,
		})
		.from(providerSecrets)
		.where(
			and(
				eq(providerSecrets.userId, userId),
				eq(providerSecrets.instanceId, instanceId),
			),
		);
	const secrets = new Map<string, string>();
	for (const row of rows) {
		secrets.set(
			row.fieldKey,
			await decryptSecret(
				row.envelope,
				createAssociatedData(userId, instanceId, row.fieldKey),
			),
		);
	}
	return secrets;
}

export async function saveConnectionSecrets(
	userId: string,
	instanceId: string,
	values: ReadonlyMap<string, string | undefined>,
): Promise<void> {
	const now = new Date();
	for (const [fieldKey, value] of values) {
		if (!value) {
			continue;
		}
		const envelope = await encryptSecret(
			value,
			createAssociatedData(userId, instanceId, fieldKey),
		);
		await getDb()
			.insert(providerSecrets)
			.values({
				id: uuidv7(),
				userId,
				instanceId,
				fieldKey,
				envelope,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoUpdate({
				target: [providerSecrets.instanceId, providerSecrets.fieldKey],
				set: { envelope, updatedAt: now },
			});
	}
}
