import { createFileRoute } from "@tanstack/react-router";

import { asGatewayResponse } from "#/server/errors";
import { handlePlaygroundRequest } from "#/server/playground-route.server";

async function handle(
	request: Request,
	connectionId: string,
): Promise<Response> {
	try {
		return await handlePlaygroundRequest(request, connectionId, "");
	} catch (error) {
		return asGatewayResponse(error);
	}
}

export const Route = createFileRoute("/api/playground/$connectionId")({
	server: {
		handlers: {
			DELETE: ({ params, request }) => handle(request, params.connectionId),
			GET: ({ params, request }) => handle(request, params.connectionId),
			HEAD: ({ params, request }) => handle(request, params.connectionId),
			OPTIONS: ({ params, request }) => handle(request, params.connectionId),
			PATCH: ({ params, request }) => handle(request, params.connectionId),
			POST: ({ params, request }) => handle(request, params.connectionId),
			PUT: ({ params, request }) => handle(request, params.connectionId),
		},
	},
});
