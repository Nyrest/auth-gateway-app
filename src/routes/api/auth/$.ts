import { createFileRoute } from "@tanstack/react-router";

import { getAuth } from "#/server/auth.server";

export const Route = createFileRoute("/api/auth/$")({
	server: {
		handlers: {
			GET: async ({ request }) => (await getAuth()).handler(request),
			POST: async ({ request }) => {
				if (new URL(request.url).pathname.endsWith("/sign-up/email")) {
					return Response.json(
						{
							code: "SIGNUP_DISABLED",
							message: "Create the first account through the setup page.",
						},
						{ status: 403 },
					);
				}
				return (await getAuth()).handler(request);
			},
		},
	},
});
