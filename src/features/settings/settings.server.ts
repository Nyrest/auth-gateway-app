import { eq } from "drizzle-orm";

import { getDb } from "#/db/index.server";
import { appSettings } from "#/db/schema";
import { invalidatePublicOriginCache } from "#/server/auth.server";
import { GatewayError } from "#/server/errors";
import { isAlwaysAllowedLoopbackHost } from "#/server/local-origin.server";

export type SystemSettingsView = {
	readonly publicOrigin: string | null;
};

function normalizePublicOrigin(value: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new GatewayError(
			400,
			"INVALID_PUBLIC_ORIGIN",
			"Enter a valid public origin URL.",
		);
	}
	if (
		url.protocol !== "https:" &&
		!(url.protocol === "http:" && isAlwaysAllowedLoopbackHost(url.hostname))
	) {
		throw new GatewayError(
			400,
			"INVALID_PUBLIC_ORIGIN",
			"Use HTTPS, or HTTP only for localhost or 127.0.0.1.",
		);
	}
	if (
		url.username ||
		url.password ||
		url.pathname !== "/" ||
		url.search ||
		url.hash
	) {
		throw new GatewayError(
			400,
			"INVALID_PUBLIC_ORIGIN",
			"The public origin must not include a path, query, or credentials.",
		);
	}
	return url.origin;
}

export async function getSystemSettings(): Promise<SystemSettingsView> {
	const [settings] = await getDb()
		.select({
			publicOrigin: appSettings.publicOrigin,
		})
		.from(appSettings)
		.where(eq(appSettings.id, "primary"))
		.limit(1);
	return {
		publicOrigin: settings?.publicOrigin ?? null,
	};
}

async function assertOwner(userId: string): Promise<void> {
	const [settings] = await getDb()
		.select({ ownerUserId: appSettings.ownerUserId })
		.from(appSettings)
		.where(eq(appSettings.id, "primary"))
		.limit(1);
	if (!settings?.ownerUserId || settings.ownerUserId !== userId) {
		throw new GatewayError(
			403,
			"FORBIDDEN",
			"Workspace owner permission is required.",
		);
	}
}

export async function updateSystemSettings(
	userId: string,
	input: {
		readonly publicOrigin?: string;
	},
): Promise<SystemSettingsView> {
	await assertOwner(userId);
	const now = new Date();
	const [existing] = await getDb()
		.select({ publicOrigin: appSettings.publicOrigin })
		.from(appSettings)
		.where(eq(appSettings.id, "primary"))
		.limit(1);
	const publicOrigin = input.publicOrigin
		? normalizePublicOrigin(input.publicOrigin)
		: (existing?.publicOrigin ?? null);
	const [updated] = await getDb()
		.update(appSettings)
		.set({
			publicOrigin,
			updatedAt: now,
		})
		.where(eq(appSettings.id, "primary"))
		.returning({
			publicOrigin: appSettings.publicOrigin,
		});
	if (!updated) {
		throw new GatewayError(
			500,
			"SYSTEM_SETTINGS_UNAVAILABLE",
			"System settings are unavailable.",
		);
	}
	invalidatePublicOriginCache();
	return updated;
}
