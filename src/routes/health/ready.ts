import { createFileRoute } from "@tanstack/react-router";

import { getDb } from "#/db/index.server";
import { appSettings } from "#/db/schema";

export const Route = createFileRoute("/health/ready")({
	server: {
		handlers: {
			GET: async () => {
				try {
					await getDb()
						.select({ id: appSettings.id })
						.from(appSettings)
						.limit(1);
					return Response.json(
						{ status: "ok" },
						{ headers: { "cache-control": "no-store" } },
					);
				} catch {
					return Response.json(
						{ status: "unavailable" },
						{ headers: { "cache-control": "no-store" }, status: 503 },
					);
				}
			},
		},
	},
});
