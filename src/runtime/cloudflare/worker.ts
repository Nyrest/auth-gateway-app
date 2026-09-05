import application from "@tanstack/react-start/server-entry";
import { createDatabase } from "#/db/index.server";
import type { RuntimeServices } from "#/runtime/contract.server";
import { decodeRootSecret } from "#/runtime/secret.server";
import { resolveHostnameOverHttps } from "#/server/hostname-resolution.server";
import { runScheduledMaintenance } from "#/server/scheduler.server";
import { handleApplicationRequest } from "#/server-runtime.server";

type Bindings = {
	readonly AUTH_GATEWAY_SECRET: string;
	readonly DATABASE_URL?: string;
	readonly HYPERDRIVE?: { readonly connectionString: string };
};

type ExecutionContext = {
	waitUntil(promise: Promise<unknown>): void;
};

function createServices(bindings: Bindings): RuntimeServices {
	const connectionString =
		bindings.HYPERDRIVE?.connectionString ?? bindings.DATABASE_URL;
	if (!connectionString) {
		throw new Error(
			"Configure either a HYPERDRIVE binding or a DATABASE_URL secret.",
		);
	}

	return {
		database: createDatabase(connectionString, 2),
		kind: "cloudflare",
		resolveHostname: resolveHostnameOverHttps,
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
	scheduled(
		_controller: unknown,
		bindings: Bindings,
		context: ExecutionContext,
	): void {
		context.waitUntil(
			runScheduledMaintenance(createServices(bindings), new Date(), (promise) =>
				context.waitUntil(promise),
			),
		);
	},
};
