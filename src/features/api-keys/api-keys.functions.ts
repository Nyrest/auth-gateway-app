import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireUser } from "#/server/auth-middleware";

import {
	createApiKey,
	deleteApiKey,
	listApiKeyScopeOptions,
	listApiKeys,
	revokeApiKey,
	updateApiKey,
} from "./api-keys.server";

const apiKeysQuerySchema = z
	.object({
		search: z.string().max(120).optional(),
		status: z.enum(["all", "active", "expired", "revoked"]).optional(),
		page: z.number().int().min(0).optional(),
		pageSize: z.number().int().min(1).max(100).optional(),
		sort: z.enum(["prefix", "label", "expiresAt", "status"]).optional(),
		direction: z.enum(["asc", "desc"]).optional(),
	})
	.strict()
	.default({});

export const listApiKeysForUser = createServerFn({ method: "GET" })
	.middleware([requireUser])
	.validator(apiKeysQuerySchema)
	.handler(({ context, data }) => listApiKeys(context.userId, data ?? {}));

export const getApiKeysPageDataForUser = createServerFn({ method: "GET" })
	.middleware([requireUser])
	.validator(apiKeysQuerySchema)
	.handler(async ({ context, data }) => {
		const [keys, scopeOptions] = await Promise.all([
			listApiKeys(context.userId, data ?? {}),
			listApiKeyScopeOptions(context.userId),
		]);
		return { keys, scopeOptions };
	});

export const createApiKeyForUser = createServerFn({ method: "POST" })
	.middleware([requireUser])
	.validator(
		z
			.object({
				label: z.string().min(1).max(120),
				providerScopeMode: z.enum(["all", "selected"]).default("all"),
				providerSlugs: z.array(z.string().min(1).max(63)).max(100).default([]),
				instanceIds: z.array(z.uuid()).max(100).default([]),
				expiresAt: z.coerce.date().nullable().optional(),
			})
			.strict(),
	)
	.handler(({ context, data }) => createApiKey(context.userId, data));

export const updateApiKeyForUser = createServerFn({ method: "POST" })
	.middleware([requireUser])
	.validator(
		z
			.object({
				id: z.uuid(),
				label: z.string().min(1).max(120),
				providerScopeMode: z.enum(["all", "selected"]).default("all"),
				providerSlugs: z.array(z.string().min(1).max(63)).max(100).default([]),
				instanceIds: z.array(z.uuid()).max(100).default([]),
				expiresAt: z.coerce.date().nullable().optional(),
			})
			.strict(),
	)
	.handler(({ context, data }) => updateApiKey(context.userId, data.id, data));

export const deleteApiKeyForUser = createServerFn({ method: "POST" })
	.middleware([requireUser])
	.validator(z.object({ id: z.uuid() }).strict())
	.handler(async ({ context, data }) => {
		await deleteApiKey(context.userId, data.id);
		return { ok: true };
	});

export const listApiKeyScopeOptionsForUser = createServerFn({ method: "GET" })
	.middleware([requireUser])
	.handler(({ context }) => listApiKeyScopeOptions(context.userId));

export const revokeApiKeyForUser = createServerFn({ method: "POST" })
	.middleware([requireUser])
	.validator(z.object({ id: z.uuid() }).strict())
	.handler(async ({ context, data }) => {
		await revokeApiKey(context.userId, data.id);
		return { ok: true };
	});
