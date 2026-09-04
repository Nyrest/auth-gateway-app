import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { PageHeader } from "#/components/layout/app-shell";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { auditEventsPageQueryOptions } from "#/lib/api";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";

type AuditSearch = {
	readonly page: number;
	readonly pageSize: number;
	readonly result: "all" | "success" | "failure" | "invalid" | "degraded";
	readonly search: string;
};

function parseAuditSearch(input: Record<string, unknown>): AuditSearch {
	const page = Number(input.page);
	const pageSize = Number(input.pageSize);
	const result = input.result;
	return {
		page: Number.isInteger(page) && page > 0 ? page : 1,
		pageSize:
			Number.isInteger(pageSize) && pageSize > 0 ? Math.min(100, pageSize) : 25,
		result:
			result === "success" ||
			result === "failure" ||
			result === "invalid" ||
			result === "degraded"
				? result
				: "all",
		search: typeof input.search === "string" ? input.search : "",
	};
}

const auditActionLabels: Record<string, () => string> = {
	"connection.created": () => m.audit_action_connection_created(),
	"connection.updated": () => m.audit_action_connection_updated(),
	"connection.deleted": () => m.audit_action_connection_deleted(),
	"connection.enabled": () => m.audit_action_connection_enabled(),
	"connection.disabled": () => m.audit_action_connection_disabled(),
	"connection.verified": () => m.audit_action_connection_verified(),
	"connection.verification_failed": () =>
		m.audit_action_connection_verification_failed(),
	"connection.oauth_connected": () =>
		m.audit_action_connection_oauth_connected(),
	"api_key.created": () => m.audit_action_api_key_created(),
	"api_key.updated": () => m.audit_action_api_key_updated(),
	"api_key.deleted": () => m.audit_action_api_key_deleted(),
	"api_key.revoked": () => m.audit_action_api_key_revoked(),
	"system_settings.updated": () => m.audit_action_system_settings_updated(),
};

const auditResourceLabels: Record<string, () => string> = {
	connection: () => m.audit_resource_connection(),
	api_key: () => m.audit_resource_api_key(),
	system_settings: () => m.audit_resource_system_settings(),
};

function auditActionText(value: string): string {
	return auditActionLabels[value]?.() ?? m.unknown();
}

function auditResourceText(value: string): string {
	return auditResourceLabels[value]?.() ?? m.unknown();
}

function auditResultText(value: string): string {
	if (value === "success") return m.success();
	if (value === "failure") return m.failure();
	if (value === "invalid") return m.invalid();
	if (value === "degraded") return m.degraded();
	return m.unknown();
}

function formatAuditDate(value: Date | string): string {
	return new Intl.DateTimeFormat(getLocale(), {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

export const Route = createFileRoute("/_authenticated/audit/")({
	validateSearch: parseAuditSearch,
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		context.queryClient.ensureQueryData(
			auditEventsPageQueryOptions({
				page: deps.page,
				pageSize: deps.pageSize,
				...(deps.search ? { search: deps.search } : {}),
				...(deps.result !== "all" ? { result: deps.result } : {}),
			}),
		),
	component: AuditPage,
});

function AuditPage() {
	const searchParams = Route.useSearch();
	const navigate = Route.useNavigate();
	const [searchInput, setSearchInput] = useState(searchParams.search);
	const query = useSuspenseQuery(
		auditEventsPageQueryOptions({
			page: searchParams.page,
			pageSize: searchParams.pageSize,
			...(searchParams.search ? { search: searchParams.search } : {}),
			...(searchParams.result !== "all" ? { result: searchParams.result } : {}),
		}),
	);
	const total = query.data.total;
	const pageCount = Math.max(1, Math.ceil(total / searchParams.pageSize));
	const safePage = Math.min(searchParams.page, pageCount);
	useEffect(() => {
		if (searchParams.page <= safePage) return;
		void navigate({
			search: (current) => ({ ...current, page: safePage }),
			replace: true,
		});
	}, [navigate, safePage, searchParams.page]);

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
			<PageHeader title={m.audit_log()} description={m.audit_description()} />
			<div className="mb-4 flex flex-wrap gap-2">
				<div className="relative min-w-56 flex-1">
					<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="pl-9"
						value={searchInput}
						onChange={(event) => setSearchInput(event.target.value)}
						placeholder={m.search_activity()}
						aria-label={m.search_activity()}
					/>
				</div>
				<Select
					value={searchParams.result}
					onValueChange={(value) => {
						void navigate({
							search: (current) => ({
								...current,
								result: value as AuditSearch["result"],
								page: 1,
							}),
							replace: true,
						});
					}}
				>
					<SelectTrigger className="w-36" aria-label={m.filter_by_result()}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">{m.all_results()}</SelectItem>
						<SelectItem value="success">{m.success()}</SelectItem>
						<SelectItem value="failure">{m.failure()}</SelectItem>
						<SelectItem value="invalid">{m.invalid()}</SelectItem>
						<SelectItem value="degraded">{m.degraded()}</SelectItem>
					</SelectContent>
				</Select>
			</div>
			<Card>
				<CardContent className="p-0">
					{query.data.items.length === 0 ? (
						<div className="p-10 text-center text-sm text-muted-foreground">
							{total ? m.audit_no_match() : m.audit_empty()}
						</div>
					) : (
						<>
							<div className="divide-y">
								{query.data.items.map((event) => (
									<div
										className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
										key={event.id}
									>
										<div className="min-w-0">
											<p className="truncate font-medium">
												{auditActionText(event.action)}
											</p>
											<p className="truncate text-xs text-muted-foreground">
												{auditResourceText(event.resourceType)}
												{event.resourceId
													? ` · ${event.resourceId.slice(0, 8)}`
													: ""}
												{event.metadata && typeof event.metadata === "object"
													? ` · ${m.audit_metadata_details({ count: Object.keys(event.metadata).length })}`
													: ""}
											</p>
										</div>
										<div className="flex shrink-0 items-center gap-3">
											<Badge
												variant={
													event.result === "failure" ||
													event.result === "invalid"
														? "destructive"
														: "outline"
												}
											>
												{auditResultText(event.result)}
											</Badge>
											<time className="text-xs text-muted-foreground">
												{formatAuditDate(event.occurredAt)}
											</time>
										</div>
									</div>
								))}
							</div>
							<div className="flex items-center justify-between border-t px-4 py-2 text-sm text-muted-foreground">
								<span>{m.events_count({ count: total })}</span>
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
						</>
					)}
				</CardContent>
			</Card>
		</>
	);
}
