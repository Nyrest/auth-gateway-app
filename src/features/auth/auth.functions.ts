import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq, isNull } from "drizzle-orm";
import { type GatewayDatabase, getDb } from "#/db/index.server";
import { appSettings, userSettings } from "#/db/schema";
import {
	changePasswordSchema,
	setupSchema,
} from "#/features/auth/auth-validation";
import { getAuth, getSession } from "#/server/auth.server";
import { requireUser } from "#/server/auth-middleware";
import { GatewayError } from "#/server/errors";

function normalizeOrigin(value: string): string {
	const url = new URL(value);
	if (
		url.protocol !== "https:" &&
		!(url.protocol === "http:" && url.hostname === "localhost")
	) {
		throw new GatewayError(
			400,
			"INVALID_PUBLIC_ORIGIN",
			"Use HTTPS, or HTTP only for localhost.",
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

export const getSetupStatus = createServerFn({ method: "GET" }).handler(
	async () => {
		const db = getDb();
		const [settings] = await db
			.select({ ownerUserId: appSettings.ownerUserId })
			.from(appSettings)
			.where(eq(appSettings.id, "primary"))
			.limit(1);
		return { setupRequired: !settings?.ownerUserId };
	},
);

export const completeSetup = createServerFn({ method: "POST" })
	.validator(setupSchema)
	.handler(async ({ data }) => {
		const db = getDb();
		const publicOrigin = normalizeOrigin(data.publicOrigin);

		return db.transaction(async (tx) => {
			const [settings] = await tx
				.select({ ownerUserId: appSettings.ownerUserId })
				.from(appSettings)
				.where(eq(appSettings.id, "primary"))
				.for("update");

			if (!settings || settings.ownerUserId) {
				throw new GatewayError(
					409,
					"SETUP_ALREADY_CLAIMED",
					"This installation has already been claimed.",
				);
			}

			// Better Auth writes through this same transaction, so a failed setup
			// cannot leave behind an account that was never made the owner.
			const response = await (
				await getAuth(publicOrigin, tx as GatewayDatabase)
			).api.signUpEmail({
				body: { email: data.email, name: data.name, password: data.password },
			});

			await tx
				.update(appSettings)
				.set({
					ownerUserId: response.user.id,
					publicOrigin,
					updatedAt: new Date(),
				})
				.where(
					and(eq(appSettings.id, "primary"), isNull(appSettings.ownerUserId)),
				);
			await tx
				.insert(userSettings)
				.values({ userId: response.user.id })
				.onConflictDoNothing();

			return {
				user: {
					email: response.user.email,
					id: response.user.id,
					name: response.user.name,
				},
			};
		});
	});

export const getCurrentSession = createServerFn({ method: "GET" }).handler(
	async () => {
		const session = await getSession(getRequest().headers);
		return session
			? {
					user: {
						email: session.user.email,
						id: session.user.id,
						name: session.user.name,
					},
				}
			: null;
	},
);

export const changePassword = createServerFn({ method: "POST" })
	.middleware([requireUser])
	.validator(changePasswordSchema)
	.handler(async ({ data }) => {
		await (await getAuth()).api.changePassword({
			body: {
				currentPassword: data.currentPassword,
				newPassword: data.newPassword,
				revokeOtherSessions: true,
			},
			headers: getRequest().headers,
		});
		return { ok: true };
	});
