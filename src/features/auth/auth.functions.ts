import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "#/db/index.server";
import { appSettings, userSettings } from "#/db/schema";
import { getAuth, getSession } from "#/server/auth.server";
import { requireUser } from "#/server/auth-middleware";
import { isValidSetupToken } from "#/server/config.server";
import { createApiKeySecret } from "#/server/crypto.server";
import { GatewayError } from "#/server/errors";

const setupSchema = z
	.object({
		name: z.string().trim().min(1).max(100),
		email: z.email().max(320),
		password: z.string().min(15).max(128),
		publicOrigin: z.url().max(2_048),
		setupToken: z.string().min(20).max(200),
	})
	.strict();

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
		if (!isValidSetupToken(data.setupToken)) {
			throw new GatewayError(
				403,
				"INVALID_SETUP_TOKEN",
				"The setup token is invalid.",
			);
		}
		const db = getDb();
		const claim = createApiKeySecret();
		const now = new Date();
		const claimExpiresAt = new Date(now.getTime() + 5 * 60 * 1_000);
		const publicOrigin = normalizeOrigin(data.publicOrigin);

		const claimed = await db.transaction(async (tx) => {
			const [row] = await tx
				.update(appSettings)
				.set({
					setupClaim: claim,
					setupClaimExpiresAt: claimExpiresAt,
					publicOrigin,
					updatedAt: now,
				})
				.where(
					and(
						eq(appSettings.id, "primary"),
						isNull(appSettings.ownerUserId),
						or(
							isNull(appSettings.setupClaimExpiresAt),
							lt(appSettings.setupClaimExpiresAt, now),
						),
					),
				)
				.returning({ id: appSettings.id });
			return row;
		});

		if (!claimed) {
			throw new GatewayError(
				409,
				"SETUP_ALREADY_CLAIMED",
				"This installation has already been claimed.",
			);
		}

		try {
			const response = await (await getAuth()).api.signUpEmail({
				body: { email: data.email, name: data.name, password: data.password },
			});

			await db.transaction(async (tx) => {
				await tx
					.update(appSettings)
					.set({
						ownerUserId: response.user.id,
						setupClaim: null,
						setupClaimExpiresAt: null,
						updatedAt: new Date(),
					})
					.where(
						and(
							eq(appSettings.id, "primary"),
							eq(appSettings.setupClaim, claim),
						),
					);
				await tx
					.insert(userSettings)
					.values({ userId: response.user.id })
					.onConflictDoNothing();
			});

			return {
				user: {
					email: response.user.email,
					id: response.user.id,
					name: response.user.name,
				},
			};
		} catch (error) {
			await db
				.update(appSettings)
				.set({
					setupClaim: null,
					setupClaimExpiresAt: null,
					updatedAt: new Date(),
				})
				.where(
					and(eq(appSettings.id, "primary"), eq(appSettings.setupClaim, claim)),
				);
			throw error;
		}
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
	.validator(
		z
			.object({
				currentPassword: z.string().min(1),
				newPassword: z.string().min(15).max(128),
			})
			.strict(),
	)
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
