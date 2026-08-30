import type { RequestRuntime } from "#/runtime/contract.server";

declare module "@tanstack/react-router" {
	interface Register {
		server: {
			requestContext: { runtime: RequestRuntime };
		};
	}
}
