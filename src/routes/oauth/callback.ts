import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { finishOAuthConnection } from "#/features/connections/oauth.server";
import { asGatewayResponse, GatewayError } from "#/server/errors";

// Providers may include metadata such as iss, scope, authuser, and prompt.
// Strip those fields while validating the callback values we use.
const callbackSchema = z.object({
	code: z.string().min(1).max(4_096).optional(),
	error: z.string().max(256).optional(),
	state: z.string().min(20).max(512),
});

export const Route = createFileRoute("/oauth/callback")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				try {
					const url = new URL(request.url);
					const query = Object.fromEntries(url.searchParams);
					const callback = callbackSchema.safeParse(query);
					if (!callback.success) {
						throw new GatewayError(
							400,
							"OAUTH_CALLBACK_INVALID",
							"The OAuth callback parameters are invalid.",
						);
					}
					await finishOAuthConnection(callback.data);
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
