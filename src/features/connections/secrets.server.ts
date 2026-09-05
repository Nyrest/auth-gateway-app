import { and, eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { type GatewayDatabase, getDb } from "#/db/index.server";
import { providerSecrets } from "#/db/schema";
import {
	createAssociatedData,
	decryptSecret,
	encryptSecret,
} from "#/server/crypto.server";

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
	return new Map(
		await Promise.all(
			rows.map(
				async (row) =>
					[
						row.fieldKey,
						await decryptSecret(
							row.envelope,
							createAssociatedData(userId, instanceId, row.fieldKey),
						),
					] as const,
			),
		),
	);
}

export async function saveConnectionSecrets(
	userId: string,
	instanceId: string,
	values: ReadonlyMap<string, string | undefined>,
	database: GatewayDatabase = getDb(),
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
		await database
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
