import { createFileRoute } from "@tanstack/react-router";

import { asGatewayResponse } from "#/server/errors";
import { proxyRequest } from "#/server/proxy.server";

async function handle(
	request: Request,
	providerSlug: string,
): Promise<Response> {
	try {
		return await proxyRequest(request, providerSlug, "");
	} catch (error) {
		return asGatewayResponse(error);
	}
}

export const Route = createFileRoute("/endpoint/$providerSlug")({
	server: {
		handlers: {
			DELETE: ({ params, request }) => handle(request, params.providerSlug),
			GET: ({ params, request }) => handle(request, params.providerSlug),
			HEAD: ({ params, request }) => handle(request, params.providerSlug),
			OPTIONS: ({ params, request }) => handle(request, params.providerSlug),
			PATCH: ({ params, request }) => handle(request, params.providerSlug),
			POST: ({ params, request }) => handle(request, params.providerSlug),
			PUT: ({ params, request }) => handle(request, params.providerSlug),
		},
	},
});
