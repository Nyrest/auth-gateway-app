import {
	getStartContext,
	runWithStartContext,
} from "@tanstack/start-storage-context";

import { createDatabase, getDatabaseUrl } from "#/db/index.server";
import type {
	RequestRuntime,
	RuntimeInvocation,
	RuntimeServices,
} from "#/runtime/contract.server";
import { decodeRootSecret } from "#/runtime/secret.server";

import { createDeferredWork } from "./deferred-work.server";

let developmentServices: RuntimeServices | undefined;

function getDevelopmentServices(): RuntimeServices {
	if (developmentServices) return developmentServices;
	const configured = process.env.AUTH_GATEWAY_SECRET;
	if (!configured) throw new Error("AUTH_GATEWAY_SECRET is required");
	developmentServices = {
		database: createDatabase(getDatabaseUrl(), 5),
		kind: "bun",
		rootSecret: decodeRootSecret(configured),
	};
	return developmentServices;
}

export function getRequestRuntime(): RequestRuntime {
	const runtime = getRuntimeFromStartContext();
	if (runtime) return runtime;

	return {
		clientIp: null,
		deferred: createDeferredWork((promise) => {
			void promise;
		}),
		services: getDevelopmentServices(),
	};
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
