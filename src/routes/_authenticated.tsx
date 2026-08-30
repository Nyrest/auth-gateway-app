import { createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell } from "#/components/layout/app-shell";
import { getCurrentSession } from "#/features/auth/auth.functions";

export const Route = createFileRoute("/_authenticated")({
	beforeLoad: async ({ location }) => {
		const session = await getCurrentSession();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session, requestedPath: location.pathname };
	},
	component: AppShell,
});
