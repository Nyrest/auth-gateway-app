import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "#/components/layout/app-shell";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	statisticsFiltersQueryOptions,
	statisticsRequestsQueryOptions,
	statisticsSummaryQueryOptions,
} from "#/lib/api";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";

type StatisticsRange = "24h" | "7d" | "30d";

type StatisticsSearch = {
	readonly range: StatisticsRange;
	readonly page: number;
	readonly search: string;
	readonly providerSlug: string;
	readonly instanceId: string;
	readonly status: "all" | "success" | "failure";
};

function parseStatisticsSearch(
	input: Record<string, unknown>,
): StatisticsSearch {
	const range = input.range;
	const page = Number(input.page);
	const status = input.status;
	return {
		range: range === "7d" || range === "30d" ? range : "24h",
		page: Number.isInteger(page) && page > 0 ? page : 1,
		search: typeof input.search === "string" ? input.search : "",
		providerSlug:
			typeof input.providerSlug === "string" ? input.providerSlug : "",
		instanceId: typeof input.instanceId === "string" ? input.instanceId : "",
		status: status === "success" || status === "failure" ? status : "all",
	};
}

function normalizeStatisticsFilters(search: StatisticsSearch) {
	return {
		range: search.range,
		...(search.search ? { search: search.search } : {}),
		...(search.providerSlug ? { providerSlug: search.providerSlug } : {}),
		...(search.instanceId ? { instanceId: search.instanceId } : {}),
		...(search.status !== "all" ? { status: search.status } : {}),
	};
}

function formatStatisticsDate(value: Date | string): string {
	return new Intl.DateTimeFormat(getLocale(), {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

export const Route = createFileRoute("/_authenticated/statistics/")({
	validateSearch: parseStatisticsSearch,
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		Promise.all([
			context.queryClient.ensureQueryData(
				statisticsSummaryQueryOptions(normalizeStatisticsFilters(deps)),
			),
			context.queryClient.ensureQueryData(
				statisticsRequestsQueryOptions({
					...normalizeStatisticsFilters(deps),
					page: deps.page,
					pageSize: 20,
				}),
			),
			context.queryClient.ensureQueryData(
				statisticsFiltersQueryOptions(deps.range),
			),
		]),
	component: StatisticsPage,
});

function Metric({
	label,
	value,
}: {
	readonly label: string;
	readonly value: string;
}) {
	return (
		<Card>
			<CardContent className="p-4">
				<p className="text-sm text-muted-foreground">{label}</p>
				<p className="mt-1 text-2xl font-semibold">{value}</p>
			</CardContent>
		</Card>
	);
}

function StatisticsPage() {
	const searchParams = Route.useSearch();
	const navigate = Route.useNavigate();
	const [searchInput, setSearchInput] = useState(searchParams.search);
	const summaryQuery = useSuspenseQuery(
		statisticsSummaryQueryOptions(normalizeStatisticsFilters(searchParams)),
	);
	const requestsQuery = useSuspenseQuery(
		statisticsRequestsQueryOptions({
			...normalizeStatisticsFilters(searchParams),
			page: searchParams.page,
			pageSize: 20,
		}),
	);
	const filtersQuery = useSuspenseQuery(
		statisticsFiltersQueryOptions(searchParams.range),
	);
	const data = summaryQuery.data;
	const total = data.totalRequests;
	const pageCount = Math.max(1, Math.ceil(requestsQuery.data.total / 20));
	const safePage = Math.min(searchParams.page, pageCount);
	useEffect(() => {
		if (searchParams.page <= safePage) return;
		void navigate({
			search: (current) => ({ ...current, page: safePage }),
			replace: true,
		});
	}, [navigate, safePage, searchParams.page]);
	const maxHourly = useMemo(
		() => Math.max(1, ...data.hourly.map((item) => item.requests)),
		[data.hourly],
	);

	useEffect(() => setSearchInput(searchParams.search), [searchParams.search]);
	useEffect(() => {
		const timer = window.setTimeout(() => {
			if (searchInput === searchParams.search) return;
			void navigate({
				search: (current) => ({
					...current,
					search: searchInput,
					page: 1,
				}),
				replace: true,
			});
		}, 250);
		return () => window.clearTimeout(timer);
	}, [navigate, searchInput, searchParams.search]);

	return (
		<>
			<PageHeader
				title={m.statistics()}
				description={m.statistics_description()}
				actions={
					<Select
						value={searchParams.range}
						onValueChange={(value) => {
							void navigate({
								search: (current) => ({
									...current,
									range: value as StatisticsRange,
									page: 1,
								}),
								replace: true,
							});
						}}
					>
						<SelectTrigger className="w-32" aria-label={m.time_range()}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="24h">{m.last_24_hours()}</SelectItem>
							<SelectItem value="7d">{m.last_7_days()}</SelectItem>
							<SelectItem value="30d">{m.last_30_days()}</SelectItem>
						</SelectContent>
					</Select>
				}
			/>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<Metric
					label={m.requests()}
					value={m.requests_count({ count: total })}
				/>
				<Metric
					label={m.success_rate()}
					value={`${(data.successRate * 100).toFixed(data.successRate === 1 ? 0 : 1)}%`}
				/>
				<Metric
					label={m.failed_requests()}
					value={m.requests_count({ count: data.failedRequests })}
				/>
				<Metric
					label={m.average_latency()}
					value={m.duration_milliseconds({ value: data.averageLatencyMs })}
				/>
				<Metric
					label={m.p95_latency()}
					value={m.duration_milliseconds({ value: data.p95LatencyMs })}
				/>
				<Metric label={m.healthy()} value={String(data.healthyConnections)} />
				<Metric
					label={m.unhealthy()}
					value={String(data.unhealthyConnections)}
				/>
			</div>
			<div className="grid gap-4 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>{m.requests_over_time()}</CardTitle>
					</CardHeader>
					<CardContent>
						<div
							className="flex h-40 items-end gap-0.5 overflow-hidden"
							role="img"
							aria-label={m.requests_over_time()}
						>
							{data.hourly.map((item) => (
								<div
									className="flex min-w-1 flex-1 flex-col justify-end gap-1"
									key={item.bucket.toISOString()}
									title={`${formatStatisticsDate(item.bucket)}: ${m.requests_tooltip({ count: item.requests })}`}
								>
									<div
										className="bg-primary/70"
										style={{
											height: `${Math.max(2, (item.requests / maxHourly) * 100)}%`,
										}}
									/>
									<div
										className="bg-destructive/70"
										style={{
											height: `${Math.max(0, (item.failures / maxHourly) * 100)}%`,
										}}
									/>
								</div>
							))}
						</div>
						<div className="mt-2 flex justify-between text-xs text-muted-foreground">
							<span>{formatStatisticsDate(data.from)}</span>
							<span>{formatStatisticsDate(data.to)}</span>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>{m.top_endpoints()}</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-3">
						{data.topEndpoints.length ? (
							data.topEndpoints.map((item) => (
								<div
									className="flex items-center justify-between gap-3 text-sm"
									key={item.path}
								>
									<code className="truncate">{item.path}</code>
									<Badge variant="secondary">{item.requests}</Badge>
								</div>
							))
						) : (
							<p className="text-sm text-muted-foreground">
								{m.no_endpoint_data()}
							</p>
						)}
					</CardContent>
				</Card>
			</div>
			<div className="grid gap-4 lg:grid-cols-3">
				<Card className="lg:col-span-2">
					<CardHeader>
						<CardTitle>{m.recent_proxy_requests()}</CardTitle>
					</CardHeader>
					<CardContent className="p-0">
						<div className="grid gap-2 border-b p-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_160px]">
							<div className="relative">
								<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									className="pl-9"
									value={searchInput}
									onChange={(event) => setSearchInput(event.target.value)}
									placeholder={m.search_endpoint_provider()}
									aria-label={m.search_endpoint_provider()}
								/>
							</div>
							<Select
								value={searchParams.providerSlug || "all"}
								onValueChange={(value) => {
									void navigate({
										search: (current) => ({
											...current,
											providerSlug: value === "all" ? "" : value,
											page: 1,
										}),
										replace: true,
									});
								}}
							>
								<SelectTrigger aria-label={m.provider()}>
									<SelectValue placeholder={m.all_providers()} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">{m.all_providers()}</SelectItem>
									{filtersQuery.data.providers.map((provider) => (
										<SelectItem
											key={provider.providerSlug}
											value={provider.providerSlug}
										>
											{provider.providerSlug}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Select
								value={searchParams.instanceId || "all"}
								onValueChange={(value) => {
									void navigate({
										search: (current) => ({
											...current,
											instanceId: value === "all" ? "" : value,
											page: 1,
										}),
										replace: true,
									});
								}}
							>
								<SelectTrigger aria-label={m.instance()}>
									<SelectValue placeholder={m.instance()} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">{m.all_instances()}</SelectItem>
									{filtersQuery.data.instances.map((instance) => (
										<SelectItem key={instance.id} value={instance.id}>
											{instance.name} · {instance.instanceSlug}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Select
								value={searchParams.status}
								onValueChange={(value) => {
									void navigate({
										search: (current) => ({
											...current,
											status: value as StatisticsSearch["status"],
											page: 1,
										}),
										replace: true,
									});
								}}
							>
								<SelectTrigger aria-label={m.status()}>
									<SelectValue placeholder={m.all_statuses()} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">{m.all_statuses()}</SelectItem>
									<SelectItem value="success">{m.success()}</SelectItem>
									<SelectItem value="failure">{m.failure()}</SelectItem>
								</SelectContent>
							</Select>
						</div>
						{requestsQuery.data.items.length ? (
							<div className="divide-y">
								{requestsQuery.data.items.map((item) => (
									<div
										className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
										key={item.id}
									>
										<div className="min-w-0">
											<p className="truncate font-medium">
												<span className="mr-2 text-muted-foreground">
													{item.method}
												</span>
												{item.path}
											</p>
											<p className="truncate text-xs text-muted-foreground">
												{item.providerSlug}
												{item.instanceId ? ` · ${item.instanceId}` : ""} ·{" "}
												{formatStatisticsDate(item.occurredAt)} ·{" "}
												{m.duration_milliseconds({ value: item.latencyMs })}
											</p>
										</div>
										<Badge
											variant={
												item.statusCode < 400 ? "secondary" : "destructive"
											}
										>
											{item.statusCode}
										</Badge>
									</div>
								))}
							</div>
						) : (
							<div className="p-10 text-center text-sm text-muted-foreground">
								<Activity className="mx-auto mb-2 size-6" />
								{total === 0 && data.failedRequests === 0
									? m.no_proxy_requests()
									: m.no_requests_match()}
							</div>
						)}
						<div className="flex items-center justify-between border-t px-4 py-2 text-sm text-muted-foreground">
							<span>
								{m.requests_count({ count: requestsQuery.data.total })}
							</span>
							<div className="flex items-center gap-1">
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={() =>
										void navigate({
											search: (current) => ({
												...current,
												page: Math.max(1, current.page - 1),
											}),
										})
									}
									disabled={safePage === 1}
									aria-label={m.previous_page()}
								>
									<ChevronLeft />
								</Button>
								<span>
									{safePage} / {pageCount}
								</span>
								<Button
									variant="ghost"
									size="icon-sm"
									onClick={() =>
										void navigate({
											search: (current) => ({
												...current,
												page: Math.min(pageCount, current.page + 1),
											}),
										})
									}
									disabled={safePage >= pageCount}
									aria-label={m.next_page()}
								>
									<ChevronRight />
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>{m.status()}</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-3">
						{data.statusCodes.length ? (
							data.statusCodes.map((item) => (
								<div
									className="flex items-center justify-between gap-3 text-sm"
									key={item.statusCode}
								>
									<span>{item.statusCode}</span>
									<Badge variant="secondary">{item.requests}</Badge>
								</div>
							))
						) : (
							<p className="text-sm text-muted-foreground">
								{m.no_status_data()}
							</p>
						)}
					</CardContent>
				</Card>
			</div>
			<Card className="mt-4">
				<CardHeader>
					<CardTitle>{m.top_providers()}</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-3">
					{data.topProviders.length ? (
						data.topProviders.map((item) => (
							<div
								className="grid gap-2 text-sm lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
								key={item.providerSlug}
							>
								<code className="truncate">{item.providerSlug}</code>
								<span>{m.requests_count({ count: item.totalRequests })}</span>
								<span>
									{m.failed_requests()}: {item.failedRequests}
								</span>
								<span>
									{m.duration_milliseconds({ value: item.averageLatencyMs })}
								</span>
							</div>
						))
					) : (
						<p className="text-sm text-muted-foreground">{m.no_providers()}</p>
					)}
				</CardContent>
			</Card>
		</>
	);
}
