import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { finishOAuthConnection } from "#/features/connections/oauth.server";
import { asGatewayResponse } from "#/server/errors";

const callbackSchema = z
	.object({
		code: z.string().min(1).max(4_096).optional(),
		error: z.string().max(256).optional(),
		state: z.string().min(20).max(512),
	})
	.strict();

export const Route = createFileRoute("/oauth/callback")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url);
					const query = Object.fromEntries(url.searchParams);
					const callback = callbackSchema.parse(query);
					await finishOAuthConnection(callback);
					return Response.redirect(
						new URL("/connections?oauth=connected", request.url),
						303,
					);
				} catch (error) {
					return asGatewayResponse(error);
				}
			},
		},
	},
});
