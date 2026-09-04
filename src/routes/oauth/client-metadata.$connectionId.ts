import { createFileRoute } from "@tanstack/react-router";

import { getOAuthClientMetadata } from "#/features/connections/oauth.server";
import { asGatewayResponse } from "#/server/errors";

export const Route = createFileRoute("/oauth/client-metadata/$connectionId")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				try {
					return Response.json(
						await getOAuthClientMetadata(params.connectionId),
						{
							headers: { "cache-control": "public, max-age=300" },
						},
					);
				} catch (error) {
					return asGatewayResponse(error);
				}
			},
		},
	},
});
