import { passkey } from "@better-auth/passkey";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { appSettings, gatewaySchema } from "#/db/schema";

import { type GatewayDatabase, getDb } from "../db/index.server";
import { createAuthBaseUrl } from "./auth-origin.server";
import { getBetterAuthSecret } from "./config.server";

const publicOriginCacheTtlMs = 10_000;

let publicOriginCache:
	| { readonly expiresAt: number; readonly value: string | undefined }
	| undefined;
let publicOriginCacheGeneration = 0;

export function invalidatePublicOriginCache(): void {
	publicOriginCacheGeneration += 1;
	publicOriginCache = undefined;
}

async function getPublicOrigin(
	database: GatewayDatabase,
): Promise<string | undefined> {
	const now = Date.now();
	if (publicOriginCache && publicOriginCache.expiresAt > now) {
		return publicOriginCache.value;
	}
	// Keep only the resolved setting; D1 objects and their promises stay request-scoped.
	const generation = publicOriginCacheGeneration;
	const [settings] = await database
		.select({ publicOrigin: appSettings.publicOrigin })
		.from(appSettings)
		.where(eq(appSettings.id, "primary"))
		.limit(1);
	const value = settings?.publicOrigin ?? undefined;
	if (generation === publicOriginCacheGeneration) {
		publicOriginCache = {
			expiresAt: Date.now() + publicOriginCacheTtlMs,
			value,
		};
	}
	return value;
}

export async function getAuth(
	baseURLOverride?: string,
	database?: GatewayDatabase,
) {
	const db = database ?? getDb();
	let publicOrigin = baseURLOverride;
	if (publicOrigin === undefined) {
		publicOrigin = await getPublicOrigin(db);
	}

	return betterAuth({
		appName: "Auth Gateway",
		baseURL: publicOrigin ? createAuthBaseUrl(publicOrigin) : undefined,
		secret: getBetterAuthSecret(),
		database: drizzleAdapter(db, {
			provider: "sqlite",
			schema: gatewaySchema,
		}),
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 8,
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
			database: { generateId: () => uuidv7() },
		},
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
		plugins: [tanstackStartCookies(), passkey({ rpName: "Auth Gateway" })],
	});
}

export type GatewayAuth = Awaited<ReturnType<typeof getAuth>>;

export async function getSession(requestHeaders: Headers) {
	return (await getAuth()).api.getSession({ headers: requestHeaders });
}
