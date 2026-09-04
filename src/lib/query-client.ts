import { QueryClient } from "@tanstack/react-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getServerQueryClient } from "./query-client.server";

let browserQueryClient: QueryClient | undefined;

export function createQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 30_000,
				gcTime: 5 * 60_000,
				retry: 1,
				refetchOnWindowFocus: false,
				retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4_000),
			},
		},
	});
}

export function getQueryClient(): QueryClient {
	return getQueryClientByEnvironment();
}

const getQueryClientByEnvironment = createIsomorphicFn()
	.client(() => {
		if (!browserQueryClient) browserQueryClient = createQueryClient();
		return browserQueryClient;
	})
	.server(() => getServerQueryClient());
