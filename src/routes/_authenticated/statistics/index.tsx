import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "#/components/layout/app-shell";
import { Card, CardContent } from "#/components/ui/card";
import { statisticsQueryOptions } from "#/lib/api";
import { getQueryClient } from "#/lib/query-client";

export const Route = createFileRoute("/_authenticated/statistics/")({
	loader: () => getQueryClient().ensureQueryData(statisticsQueryOptions()),
	component: StatisticsPage,
});

function StatisticsPage() {
	const statistics = Route.useLoaderData();
	return (
		<>
			<PageHeader
				description="Proxy response status and latency summaries are retained for 30 days and never include request or credential content."
				title="Statistics"
			/>
			<Card>
				<CardContent className="divide-y py-0">
					{statistics.length === 0 ? (
						<p className="py-10 text-sm text-muted-foreground">
							Statistics appear once a proxy API key forwards traffic.
						</p>
					) : (
						statistics.map((item) => (
							<div
								className="grid gap-2 py-4 text-sm sm:grid-cols-4"
								key={item.providerSlug}
							>
								<p className="font-mono font-medium">{item.providerSlug}</p>
								<p>{item.totalRequests} requests</p>
								<p>{item.averageLatencyMs} ms avg.</p>
								<p>{item.failedRequests} failed</p>
							</div>
						))
					)}
				</CardContent>
			</Card>
		</>
	);
}
