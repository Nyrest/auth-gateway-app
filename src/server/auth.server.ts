import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";

import { appSettings, gatewaySchema } from "#/db/schema";

import { getDb } from "../db/index.server";
import { getBetterAuthSecret } from "./config.server";

export async function getAuth() {
	const db = getDb();
	const [settings] = await db
		.select({ publicOrigin: appSettings.publicOrigin })
		.from(appSettings)
		.where(eq(appSettings.id, "primary"))
		.limit(1);
	const publicOrigin = settings?.publicOrigin ?? undefined;

	return betterAuth({
		appName: "Auth Gateway",
		baseURL: publicOrigin,
		secret: getBetterAuthSecret(),
		database: drizzleAdapter(db, {
			provider: "pg",
			schema: gatewaySchema,
		}),
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 15,
			maxPasswordLength: 128,
		},
		session: {
			expiresIn: 60 * 60 * 12,
			updateAge: 60 * 60,
			cookieCache: { enabled: false },
		},
		rateLimit: {
			enabled: true,
			storage: "database",
			window: 60,
			max: 10,
		},
		advanced: {
			useSecureCookies: publicOrigin?.startsWith("https://") ?? false,
			database: { generateId: "uuid" },
		},
		trustedOrigins: publicOrigin ? [publicOrigin] : [],
		databaseHooks: {
			user: {
				create: {
					before: async (user) => {
						const [settings] = await db
							.select({ ownerUserId: appSettings.ownerUserId })
							.from(appSettings)
							.where(eq(appSettings.id, "primary"))
							.limit(1);

						if (settings?.ownerUserId) {
							throw new Error(
								"Public sign-up is disabled for this installation",
							);
						}
						return { data: user };
					},
				},
			},
		},
		plugins: [tanstackStartCookies()],
	});
}

export type GatewayAuth = Awaited<ReturnType<typeof getAuth>>;

export async function getSession(requestHeaders: Headers) {
	return (await getAuth()).api.getSession({ headers: requestHeaders });
}
