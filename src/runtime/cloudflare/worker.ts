import type { D1Database } from "@cloudflare/workers-types";
import application from "@tanstack/react-start/server-entry";
import { createDatabase } from "#/db/index.server";
import type { RuntimeServices } from "#/runtime/contract.server";
import { decodeRootSecret } from "#/runtime/secret.server";
import { runScheduledMaintenance } from "#/server/scheduler.server";
import { handleApplicationRequest } from "#/server-runtime.server";

type Bindings = {
	readonly AUTH_GATEWAY_SECRET: string;
	readonly DB: D1Database;
};

type ExecutionContext = {
	waitUntil(promise: Promise<unknown>): void;
};

function createServices(bindings: Bindings): RuntimeServices {
	if (!bindings.DB) {
		throw new Error("A D1 binding named DB is required.");
	}

	return {
		database: createDatabase(bindings.DB),
		rootSecret: decodeRootSecret(bindings.AUTH_GATEWAY_SECRET),
	};
}

export default {
	async fetch(
		request: Request,
		bindings: Bindings,
		context: ExecutionContext,
	): Promise<Response> {
		return handleApplicationRequest(
			application,
			request,
			createServices(bindings),
			{
				clientIp: request.headers.get("cf-connecting-ip"),
				deferPromise: (promise) => context.waitUntil(promise),
			},
		);
	},
	async scheduled(
		_controller: unknown,
		bindings: Bindings,
		context: ExecutionContext,
	): Promise<void> {
		const services = createServices(bindings);

		context.waitUntil(
			runScheduledMaintenance(services, new Date(), (promise) =>
				context.waitUntil(promise),
			),
		);
	},
};
