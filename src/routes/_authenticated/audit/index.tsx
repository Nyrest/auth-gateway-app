import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "#/components/layout/app-shell";
import { Card, CardContent } from "#/components/ui/card";
import { auditEventsQueryOptions } from "#/lib/api";
import { getQueryClient } from "#/lib/query-client";

export const Route = createFileRoute("/_authenticated/audit/")({
	loader: () => getQueryClient().ensureQueryData(auditEventsQueryOptions()),
	component: AuditPage,
});

function AuditPage() {
	const events = Route.useLoaderData();
	return (
		<>
			<PageHeader
				description="A tamper-evident operational trail for gateway mutations, intentionally free of credentials and request bodies."
				title="Audit"
			/>
			<Card>
				<CardContent className="divide-y py-0">
					{events.length === 0 ? (
						<p className="py-10 text-sm text-muted-foreground">
							Audit events will appear as you create, update, and revoke gateway
							resources.
						</p>
					) : (
						events.map((event) => (
							<div
								className="flex items-center justify-between gap-4 py-4 text-sm"
								key={event.id}
							>
								<div>
									<p className="font-medium">{event.action}</p>
									<p className="text-xs text-muted-foreground">
										{event.resourceType}
										{event.resourceId
											? ` · ${event.resourceId.slice(0, 8)}`
											: ""}
									</p>
								</div>
								<time className="text-xs text-muted-foreground">
									{new Date(event.occurredAt).toLocaleString()}
								</time>
							</div>
						))
					)}
				</CardContent>
			</Card>
		</>
	);
}
