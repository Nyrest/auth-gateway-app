import { dehydrate, hydrate } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { getQueryClient } from "./lib/query-client";
import { routeTree } from "./routeTree.gen";

export type RouterDehydratedState = { readonly queryClient: unknown };

export function getRouter() {
	const queryClient = getQueryClient();
	const router = createTanStackRouter({
		routeTree,
		context: { queryClient },
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 30_000,
		defaultPendingMs: 150,
		defaultPendingMinMs: 120,
		dehydrate: () => ({ queryClient: dehydrate(queryClient) as never }),
		hydrate: (state: RouterDehydratedState) => {
			hydrate(queryClient, state.queryClient as Parameters<typeof hydrate>[1]);
		},
	});

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
		dehydrated: RouterDehydratedState;
	}
}
