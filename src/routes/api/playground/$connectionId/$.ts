import { createFileRoute } from "@tanstack/react-router";

import { asGatewayResponse } from "#/server/errors";
import { handlePlaygroundRequest } from "#/server/playground-route.server";

async function handle(
	request: Request,
	connectionId: string,
	path: string,
): Promise<Response> {
	try {
		return await handlePlaygroundRequest(request, connectionId, path);
	} catch (error) {
		return asGatewayResponse(error);
	}
}

export const Route = createFileRoute("/api/playground/$connectionId/$")({
	server: {
		handlers: {
			DELETE: ({ params, request }) =>
				handle(request, params.connectionId, params._splat ?? ""),
			GET: ({ params, request }) =>
				handle(request, params.connectionId, params._splat ?? ""),
			HEAD: ({ params, request }) =>
				handle(request, params.connectionId, params._splat ?? ""),
			OPTIONS: ({ params, request }) =>
				handle(request, params.connectionId, params._splat ?? ""),
			PATCH: ({ params, request }) =>
				handle(request, params.connectionId, params._splat ?? ""),
			POST: ({ params, request }) =>
				handle(request, params.connectionId, params._splat ?? ""),
			PUT: ({ params, request }) =>
				handle(request, params.connectionId, params._splat ?? ""),
		},
	},
});
