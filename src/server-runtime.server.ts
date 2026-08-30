import type { ServerEntry } from "@tanstack/react-start/server-entry";

import { paraglideMiddleware } from "#/paraglide/server.js";
import type {
	RuntimeInvocation,
	RuntimeServices,
} from "#/runtime/contract.server";

import { createDeferredWork } from "./server/deferred-work.server";

export async function handleApplicationRequest(
	entry: ServerEntry,
	request: Request,
	services: RuntimeServices,
	invocation: RuntimeInvocation,
): Promise<Response> {
	const deferred = createDeferredWork(invocation.deferPromise);
	try {
		return await paraglideMiddleware(request, ({ request: localizedRequest }) =>
			entry.fetch(localizedRequest, {
				context: {
					runtime: { clientIp: invocation.clientIp, deferred, services },
				},
			}),
		);
	} finally {
		deferred.flush();
	}
}
