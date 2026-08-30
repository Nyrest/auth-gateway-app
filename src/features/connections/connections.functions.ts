import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireUser } from "#/server/auth-middleware";
import { verifyConnection } from "./connection-actions.server";
import {
	asJsonObject,
	createConnection,
	deleteConnection,
	getConnection,
	listConnections,
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
		allowPrivateNetwork: z.boolean().default(false),
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
			throw new Error("Connection fields exceed the supported limit.");
		}
		return createConnection(context.userId, {
			...data,
			config: asJsonObject(data.config),
		});
	});

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
