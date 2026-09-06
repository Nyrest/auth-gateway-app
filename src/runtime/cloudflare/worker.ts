import application from "@tanstack/react-start/server-entry";
import { createHyperdriveDatabase } from "#/db/index.server";
import type { RuntimeServices } from "#/runtime/contract.server";
import { decodeRootSecret } from "#/runtime/secret.server";
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

async function createServices(bindings: Bindings): Promise<RuntimeServices> {
	const connectionString =
		bindings.HYPERDRIVE?.connectionString ?? bindings.DATABASE_URL;
	if (!connectionString) {
		throw new Error(
			"Configure either a HYPERDRIVE binding or a DATABASE_URL secret.",
		);
	}

	return {
		database: await createHyperdriveDatabase(connectionString),
		kind: "cloudflare",
		rootSecret: decodeRootSecret(bindings.AUTH_GATEWAY_SECRET),
	};
}

export default {
	async fetch(
		request: Request,
		bindings: Bindings,
		context: ExecutionContext,
	): Promise<Response> {
		const services = await createServices(bindings);

		return handleApplicationRequest(application, request, services, {
			clientIp: request.headers.get("cf-connecting-ip"),
			deferPromise: (promise) => context.waitUntil(promise),
		});
	},
	async scheduled(
		_controller: unknown,
		bindings: Bindings,
		context: ExecutionContext,
	): Promise<void> {
		const services = await createServices(bindings);

		context.waitUntil(
			runScheduledMaintenance(services, new Date(), (promise) =>
				context.waitUntil(promise),
			),
		);
	},
};
