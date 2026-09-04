import { QueryClient } from "@tanstack/react-query";
import { getStartContext } from "@tanstack/start-storage-context";
import { createQueryClient } from "./query-client";

const queryClientKey = Symbol.for("auth-gateway.query-client");

export function getServerQueryClient(): QueryClient {
	const context = getStartContext({ throwIfNotFound: false });
	if (!context) return createQueryClient();

	const requestContext = context.contextAfterGlobalMiddlewares as Record<
		string | symbol,
		unknown
	>;
	const existing = requestContext[queryClientKey];
	if (existing instanceof QueryClient) return existing;

	const queryClient = createQueryClient();
	requestContext[queryClientKey] = queryClient;
	return queryClient;
}
