import { createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell } from "#/components/layout/app-shell";
import { currentSessionQueryOptions } from "#/lib/api";

export const Route = createFileRoute("/_authenticated")({
	beforeLoad: async ({ context, location }) => {
		const session = await context.queryClient.fetchQuery(
			currentSessionQueryOptions(),
		);
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session, requestedPath: location.pathname };
	},
	component: AppShell,
});
