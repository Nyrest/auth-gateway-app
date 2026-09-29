import {
	getStartContext,
	runWithStartContext,
} from "@tanstack/start-storage-context";

import type {
	RequestRuntime,
	RuntimeInvocation,
	RuntimeServices,
} from "#/runtime/contract.server";

import { createDeferredWork } from "./deferred-work.server";

export function getRequestRuntime(): RequestRuntime {
	const runtime = getRuntimeFromStartContext();
	if (runtime) return runtime;
	throw new Error("Cloudflare request runtime context is unavailable.");
}

export function getRuntimeFromStartContext(): RequestRuntime | undefined {
	return getStartContext({ throwIfNotFound: false })
		?.contextAfterGlobalMiddlewares.runtime as RequestRuntime | undefined;
}

export async function runWithRuntimeContext<T>(
	services: RuntimeServices,
	invocation: RuntimeInvocation,
	action: () => Promise<T>,
): Promise<T> {
	const deferred = createDeferredWork(invocation.deferPromise);
	try {
		return await runWithStartContext(
			{
				contextAfterGlobalMiddlewares: {
					runtime: { clientIp: invocation.clientIp, deferred, services },
				},
				executedRequestMiddlewares: new Set(),
				getRouter: () => {
					throw new Error("The scheduler does not have a router");
				},
				handlerType: "router",
				request: new Request("https://scheduled.invalid"),
				startOptions: {},
			},
			action,
		);
	} finally {
		deferred.flush();
	}
}
