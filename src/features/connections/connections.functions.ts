import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireUser } from "#/server/auth-middleware";
import { GatewayError } from "#/server/errors";
import { verifyConnection } from "./connection-actions.server";
import {
	asJsonObject,
	createConnection,
	deleteConnection,
	getConnection,
	getConnectionDetails,
	listConnections,
	setConnectionEnabled,
	updateConnection,
} from "./connections.server";
import { beginOAuthConnection, connectClientCredentials } from "./oauth.server";
import { providerTemplates } from "./templates";

const connectionIdSchema = z.object({ id: z.uuid() }).strict();
const connectionInputSchema = z
	.object({
		templateSlug: z.string().min(1).max(80),
		name: z.string().min(1).max(120),
		providerSlug: z.string().min(1).max(63),
		baseUrl: z.url().max(2_048),
		config: z.record(z.string().max(80), z.json()).default({}),
		secrets: z.record(z.string().max(80), z.string().max(16_384)).default({}),
		healthIntervalMinutes: z.number().int().min(5).max(1_440).optional(),
	})
	.strict();

export const listProviderTemplates = createServerFn({ method: "GET" })
	.middleware([requireUser])
	.handler(() => providerTemplates);

export const listConnectionsForUser = createServerFn({ method: "GET" })
	.middleware([requireUser])
	.handler(({ context }) => listConnections(context.userId));

export const getConnectionForUser = createServerFn({ method: "GET" })
	.middleware([requireUser])
	.validator(connectionIdSchema)
	.handler(({ context, data }) => getConnection(context.userId, data.id));

export const createConnectionForUser = createServerFn({ method: "POST" })
	.middleware([requireUser])
	.validator(connectionInputSchema)
	.handler(({ context, data }) => {
		if (
			Object.keys(data.config).length > 50 ||
			Object.keys(data.secrets).length > 50
		) {
			throw new GatewayError(
				400,
				"TOO_MANY_PROVIDER_FIELDS",
				"The connection contains too many provider fields.",
			);
		}
		return createConnection(context.userId, {
			...data,
			config: asJsonObject(data.config),
		});
	});

const updateConnectionSchema = z
	.object({
		id: z.uuid(),
		name: z.string().min(1).max(120),
		providerSlug: z.string().min(1).max(63),
		baseUrl: z.url().max(2_048),
		config: z.record(z.string().max(80), z.json()).default({}),
		secrets: z.record(z.string().max(80), z.string().max(16_384)).default({}),
		clearSecrets: z.array(z.string().max(80)).max(50).default([]),
		healthIntervalMinutes: z
			.number()
			.int()
			.min(5)
			.max(1_440)
			.nullable()
			.optional(),
	})
	.strict();

export const updateConnectionForUser = createServerFn({ method: "POST" })
	.middleware([requireUser])
	.validator(updateConnectionSchema)
	.handler(({ context, data }) => {
		if (
			Object.keys(data.config).length > 50 ||
			Object.keys(data.secrets).length > 50
		) {
			throw new GatewayError(
				400,
				"TOO_MANY_PROVIDER_FIELDS",
				"The connection contains too many provider fields.",
			);
		}
		return updateConnection(context.userId, data.id, {
			...data,
			config: asJsonObject(data.config),
		});
	});

export const enableConnectionForUser = createServerFn({ method: "POST" })
	.middleware([requireUser])
	.validator(connectionIdSchema)
	.handler(({ context, data }) =>
		setConnectionEnabled(context.userId, data.id, true),
	);

export const disableConnectionForUser = createServerFn({ method: "POST" })
	.middleware([requireUser])
	.validator(connectionIdSchema)
	.handler(({ context, data }) =>
		setConnectionEnabled(context.userId, data.id, false),
	);

export const testConnectionForUser = createServerFn({ method: "POST" })
	.middleware([requireUser])
	.validator(connectionIdSchema)
	.handler(({ context, data }) => verifyConnection(context.userId, data.id));

export const getConnectionDetailsForUser = createServerFn({ method: "GET" })
	.middleware([requireUser])
	.validator(connectionIdSchema)
	.handler(({ context, data }) =>
		getConnectionDetails(context.userId, data.id),
	);

export const deleteConnectionForUser = createServerFn({ method: "POST" })
	.middleware([requireUser])
	.validator(connectionIdSchema)
	.handler(async ({ context, data }) => {
		await deleteConnection(context.userId, data.id);
		return { ok: true };
	});

export const beginOAuthForUser = createServerFn({ method: "POST" })
	.middleware([requireUser])
	.validator(connectionIdSchema)
	.handler(({ context, data }) =>
		beginOAuthConnection(context.userId, data.id),
	);

export const connectClientCredentialsForUser = createServerFn({
	method: "POST",
})
	.middleware([requireUser])
	.validator(connectionIdSchema)
	.handler(async ({ context, data }) => {
		await connectClientCredentials(context.userId, data.id);
		return { ok: true };
	});

export const verifyConnectionForUser = createServerFn({ method: "POST" })
	.middleware([requireUser])
	.validator(connectionIdSchema)
	.handler(({ context, data }) => verifyConnection(context.userId, data.id));
