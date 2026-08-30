import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireUser } from "#/server/auth-middleware";

import { createApiKey, listApiKeys, revokeApiKey } from "./api-keys.server";

export const listApiKeysForUser = createServerFn({ method: "GET" })
	.middleware([requireUser])
	.handler(({ context }) => listApiKeys(context.userId));

export const createApiKeyForUser = createServerFn({ method: "POST" })
	.middleware([requireUser])
	.validator(
		z
			.object({
				label: z.string().min(1).max(120),
				providerSlugs: z.array(z.string().min(1).max(63)).max(100).default([]),
				instanceIds: z.array(z.uuid()).max(100).default([]),
				expiresAt: z.coerce.date().optional(),
			})
			.strict(),
	)
	.handler(({ context, data }) => createApiKey(context.userId, data));

export const revokeApiKeyForUser = createServerFn({ method: "POST" })
	.middleware([requireUser])
	.validator(z.object({ id: z.uuid() }).strict())
	.handler(async ({ context, data }) => {
		await revokeApiKey(context.userId, data.id);
		return { ok: true };
	});
