import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "#/db/index.server";
import { appSettings, authUsers, userSettings } from "#/db/schema";
import {
	changePasswordSchema,
	setupSchema,
} from "#/features/auth/auth-validation";
import { getAuth, getSession } from "#/server/auth.server";
import { requireUser } from "#/server/auth-middleware";
import { GatewayError } from "#/server/errors";
import { isAlwaysAllowedLoopbackHost } from "#/server/local-origin.server";

function normalizeOrigin(value: string): string {
	const url = new URL(value);
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

		const [settings] = await db
			.select({ ownerUserId: appSettings.ownerUserId })
			.from(appSettings)
			.where(eq(appSettings.id, "primary"));

		if (!settings || settings.ownerUserId) {
			throw new GatewayError(
				409,
				"SETUP_ALREADY_CLAIMED",
				"This installation has already been claimed.",
			);
		}

		const response = await (await getAuth(publicOrigin, db)).api.signUpEmail({
			body: { email: data.email, name: data.name, password: data.password },
			headers: getRequest().headers,
		});

		try {
			const [claims] = await db.batch([
				db
					.update(appSettings)
					.set({
						ownerUserId: response.user.id,
						publicOrigin,
						updatedAt: new Date(),
					})
					.where(
						and(eq(appSettings.id, "primary"), isNull(appSettings.ownerUserId)),
					)
					.returning({ ownerUserId: appSettings.ownerUserId }),
				db
					.insert(userSettings)
					.values({ userId: response.user.id })
					.onConflictDoNothing(),
			]);

			if (!claims[0]) {
				throw new GatewayError(
					409,
					"SETUP_ALREADY_CLAIMED",
					"This installation has already been claimed.",
				);
			}
		} catch (error) {
			// Better Auth creates the user before the D1 claim batch. Removing a
			// failed claimant cascades its auth records and releases owner_user_id.
			await db.delete(authUsers).where(eq(authUsers.id, response.user.id));
			throw error;
		}

		return {
			user: {
				email: response.user.email,
				id: response.user.id,
				name: response.user.name,
			},
		};
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
