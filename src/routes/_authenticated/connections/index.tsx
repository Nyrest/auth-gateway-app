import {
	type QueryClient,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
	ArrowRight,
	CheckCircle2,
	Link2,
	LoaderCircle,
	Pencil,
	Search,
	ShieldCheck,
	ToggleLeft,
	ToggleRight,
	Trash2,
} from "lucide-react";
import {
	type KeyboardEvent,
	type MouseEvent,
	useEffect,
	useMemo,
	useState,
} from "react";

import { PageHeader } from "#/components/layout/app-shell";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	ConnectionConfigDialog,
	ConnectionDialog,
	type Template,
} from "#/features/connections/connection-dialog";
import {
	beginOAuthForUser,
	connectClientCredentialsForUser,
	disableConnectionForUser,
	enableConnectionForUser,
	getConnectionsPageDataForUser,
	testConnectionForUser,
} from "#/features/connections/connections.functions";
import type { ConnectionView } from "#/features/connections/connections.types";
import { DeleteConnectionDialog } from "#/features/connections/delete-connection-dialog";
import { ProviderIcon } from "#/features/connections/provider-icon";
import { providerName } from "#/features/connections/provider-text";
import { useCurrentTime } from "#/features/connections/use-current-time";
import {
	connectionsQueryOptions,
	providerTemplatesQueryOptions,
	queryKeys,
	systemSettingsQueryOptions,
} from "#/lib/api";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";

export const Route = createFileRoute("/_authenticated/connections/")({
	validateSearch: parseConnectionSearch,
	loader: ({ context }) => loadConnectionsPage(context.queryClient),
	component: ConnectionsPage,
});

async function loadConnectionsPage(queryClient: QueryClient): Promise<void> {
	const connectionsOptions = connectionsQueryOptions();
	const templatesOptions = providerTemplatesQueryOptions();
	const settingsOptions = systemSettingsQueryOptions();
	if (isConnectionsPageCacheEmpty(queryClient)) {
		await seedConnectionsPageCache(queryClient);
		return;
	}
	await Promise.all([
		queryClient.ensureQueryData(connectionsOptions),
		queryClient.ensureQueryData(templatesOptions),
		queryClient.ensureQueryData(settingsOptions),
	]);
}

function isConnectionsPageCacheEmpty(queryClient: QueryClient): boolean {
	return (
		queryClient.getQueryData(connectionsQueryOptions().queryKey) ===
			undefined &&
		queryClient.getQueryData(providerTemplatesQueryOptions().queryKey) ===
			undefined &&
		queryClient.getQueryData(systemSettingsQueryOptions().queryKey) ===
			undefined
	);
}

async function seedConnectionsPageCache(
	queryClient: QueryClient,
): Promise<void> {
	const pageData = await getConnectionsPageDataForUser();
	queryClient.setQueryData(
		connectionsQueryOptions().queryKey,
		pageData.connections,
	);
	queryClient.setQueryData(
		providerTemplatesQueryOptions().queryKey,
		pageData.providerTemplates,
	);
	queryClient.setQueryData(
		systemSettingsQueryOptions().queryKey,
		pageData.settings,
	);
}

type GroupBy = "none" | "category" | "provider" | "status";

type ConnectionSearch = {
	readonly search: string;
	readonly category: "all" | "generic" | "predefined";
	readonly provider: string;
	readonly status: string;
	readonly group: GroupBy;
	readonly sort: "name" | "updated" | "status";
	readonly direction: "asc" | "desc";
};

function parseConnectionSearch(
	input: Record<string, unknown>,
): ConnectionSearch {
	const category = input.category;
	const group = input.group;
	const sort = input.sort;
	return {
		search: typeof input.search === "string" ? input.search : "",
		category:
			category === "generic" || category === "predefined" ? category : "all",
		provider: typeof input.provider === "string" ? input.provider : "all",
		status: typeof input.status === "string" ? input.status : "all",
		group:
			group === "category" || group === "provider" || group === "status"
				? group
				: "none",
		sort: sort === "updated" || sort === "status" ? sort : "name",
		direction: input.direction === "desc" ? "desc" : "asc",
	};
}

function connectionStatusText(value: string): string {
	const labels: Record<string, string> = {
		draft: m.draft(),
		connecting: m.connecting(),
		active: m.active(),
		invalid: m.invalid(),
		unknown: m.unknown(),
		healthy: m.healthy(),
		unhealthy: m.unhealthy(),
	};
	return labels[value] ?? m.unknown();
}

function formatDuration(milliseconds: number): number {
	return Math.max(1, Math.ceil(milliseconds / 60_000));
}

function formatDateTime(value: Date | string): string {
	return new Intl.DateTimeFormat(getLocale(), {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function connectionGroupText(value: string): string {
	if (value === "predefined") return m.predefined();
	if (value === "generic") return m.generic();
	return connectionStatusText(value);
}

function ConnectionsPage() {
	const connectionsQuery = useSuspenseQuery(connectionsQueryOptions());
	const templatesQuery = useSuspenseQuery(providerTemplatesQueryOptions());
	const settingsQuery = useSuspenseQuery(systemSettingsQueryOptions());
	const connections = connectionsQuery.data;
	const templates = templatesQuery.data;
	const searchParams = Route.useSearch();
	const navigate = Route.useNavigate();
	const [searchInput, setSearchInput] = useState(searchParams.search);
	const { search, category, provider, status, group: groupBy } = searchParams;
	useEffect(() => setSearchInput(search), [search]);
	useEffect(() => {
		const timer = window.setTimeout(() => {
			if (searchInput === search) return;
			void navigate({
				search: (current) => ({ ...current, search: searchInput }),
				replace: true,
			});
		}, 250);
		return () => window.clearTimeout(timer);
	}, [navigate, search, searchInput]);
	const [editing, setEditing] = useState<ConnectionView>();
	const [confirmDelete, setConfirmDelete] = useState<ConnectionView>();
	const templateMap = useMemo(
		() => new Map(templates.map((template) => [template.slug, template])),
		[templates],
	);
	const statuses = useMemo(
		() =>
			[...new Set(connections.map((connection) => connection.status))].sort(),
		[connections],
	);
	const filtered = useMemo(
		() =>
			connections.filter((connection) => {
				const template = templateMap.get(connection.templateSlug);
				const haystack = [
					connection.name,
					connection.providerSlug,
					connection.instanceSlug,
					connection.baseUrl,
					template ? providerName(template) : "",
				]
					.join(" ")
					.toLowerCase();
				return (
					(!search.trim() || haystack.includes(search.trim().toLowerCase())) &&
					(category === "all" || template?.category === category) &&
					(provider === "all" || connection.templateSlug === provider) &&
					(status === "all" || connection.status === status)
				);
			}),
		[category, connections, provider, search, status, templateMap],
	);
	const groups = useMemo(() => {
		if (groupBy === "none") return [["managed", filtered] as const];
		const grouped = new Map<string, ConnectionView[]>();
		for (const connection of filtered) {
			const template = templateMap.get(connection.templateSlug);
			const key =
				groupBy === "category"
					? (template?.category ?? "unknown")
					: groupBy === "provider"
						? template
							? providerName(template)
							: connection.templateSlug
						: connection.status;
			grouped.set(key, [...(grouped.get(key) ?? []), connection]);
		}
		return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
	}, [filtered, groupBy, templateMap]);
	const sortedGroups = useMemo(() => {
		const direction = searchParams.direction === "asc" ? 1 : -1;
		return groups.map(
			([name, items]) =>
				[
					name,
					[...items].sort((left, right) => {
						const leftValue =
							searchParams.sort === "updated"
								? left.updatedAt.getTime()
								: searchParams.sort === "status"
									? left.status
									: left.name;
						const rightValue =
							searchParams.sort === "updated"
								? right.updatedAt.getTime()
								: searchParams.sort === "status"
									? right.status
									: right.name;
						return (
							String(leftValue).localeCompare(String(rightValue), undefined, {
								numeric: true,
							}) * direction
						);
					}),
				] as const,
		);
	}, [groups, searchParams.direction, searchParams.sort]);
	return (
		<>
			<PageHeader
				actions={
					<ConnectionDialog
						oauthCallbackUrl={
							settingsQuery.data.publicOrigin
								? `${settingsQuery.data.publicOrigin.replace(/\/$/, "")}/oauth/callback`
								: undefined
						}
						templates={templates}
					/>
				}
				description={m.connections_description()}
				title={m.connections()}
			/>
			<div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
				<div className="relative min-w-56 flex-1">
					<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						aria-label={m.search_connections()}
						className="pl-9"
						onChange={(event) => setSearchInput(event.target.value)}
						placeholder={m.search_connections()}
						value={searchInput}
					/>
				</div>
				<Select
					onValueChange={(value) =>
						void navigate({
							search: (current) => ({
								...current,
								category: value as ConnectionSearch["category"],
							}),
						})
					}
					value={category}
				>
					<SelectTrigger className="w-32">
						<SelectValue placeholder={m.category()} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">{m.all_categories()}</SelectItem>
						<SelectItem value="predefined">{m.predefined()}</SelectItem>
						<SelectItem value="generic">{m.generic()}</SelectItem>
					</SelectContent>
				</Select>
				<Select
					onValueChange={(value) =>
						void navigate({
							search: (current) => ({ ...current, provider: value }),
						})
					}
					value={provider}
				>
					<SelectTrigger className="w-40">
						<SelectValue placeholder={m.provider()} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">{m.all_providers()}</SelectItem>
						{templates.map((template) => (
							<SelectItem key={template.slug} value={template.slug}>
								{providerName(template)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					onValueChange={(value) =>
						void navigate({
							search: (current) => ({ ...current, status: value }),
						})
					}
					value={status}
				>
					<SelectTrigger className="w-32">
						<SelectValue placeholder={m.status()} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">{m.all_statuses()}</SelectItem>
						{statuses.map((item) => (
							<SelectItem key={item} value={item}>
								{connectionStatusText(item)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					onValueChange={(value) =>
						void navigate({
							search: (current) => ({ ...current, group: value as GroupBy }),
						})
					}
					value={groupBy}
				>
					<SelectTrigger className="w-32">
						<SelectValue placeholder={m.no_grouping()} />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="none">{m.no_grouping()}</SelectItem>
						<SelectItem value="category">{m.category()}</SelectItem>
						<SelectItem value="provider">{m.provider()}</SelectItem>
						<SelectItem value="status">{m.status()}</SelectItem>
					</SelectContent>
				</Select>
				<Select
					value={`${searchParams.sort}:${searchParams.direction}`}
					onValueChange={(value) => {
						const [sort, direction] = value.split(":");
						void navigate({
							search: (current) => ({
								...current,
								sort: (sort === "updated" || sort === "status"
									? sort
									: "name") as ConnectionSearch["sort"],
								direction: direction === "desc" ? "desc" : "asc",
							}),
						});
					}}
				>
					<SelectTrigger className="w-40" aria-label={m.sort_by()}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="name:asc">{m.sort_name_asc()}</SelectItem>
						<SelectItem value="name:desc">{m.sort_name_desc()}</SelectItem>
						<SelectItem value="updated:desc">
							{m.sort_recently_updated()}
						</SelectItem>
						<SelectItem value="status:asc">{m.sort_status()}</SelectItem>
					</SelectContent>
				</Select>
			</div>
			{connections.length === 0 ? (
				<Card className="border-dashed">
					<CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
						<ShieldCheck className="mb-4 size-8 text-muted-foreground" />
						<h2 className="font-semibold">{m.no_connections_yet()}</h2>
						<p className="mt-2 max-w-md text-sm text-muted-foreground">
							{m.no_connections_description()}
						</p>
					</CardContent>
				</Card>
			) : filtered.length === 0 ? (
				<Card className="border-dashed">
					<CardContent className="flex min-h-40 flex-col items-center justify-center text-center">
						<Search className="mb-3 size-7 text-muted-foreground" />
						<p className="text-sm text-muted-foreground">
							{m.no_connections_match()}
						</p>
						<Button
							className="mt-3"
							onClick={() => {
								setSearchInput("");
								void navigate({
									search: (current) => ({
										...current,
										search: "",
										category: "all",
										provider: "all",
										status: "all",
										group: "none",
									}),
								});
							}}
							variant="outline"
						>
							{m.clear_filters()}
						</Button>
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-6">
					{sortedGroups.map(([name, items]) => (
						<section className="grid gap-3" key={name}>
							{groupBy !== "none" ? (
								<h2 className="text-sm font-semibold">
									{connectionGroupText(name)}{" "}
									<span className="font-normal text-muted-foreground">
										({items.length})
									</span>
								</h2>
							) : null}
							<div className="grid gap-4 lg:grid-cols-2">
								{items.map((connection) => (
									<ConnectionCard
										connection={connection}
										key={connection.id}
										onDelete={() => setConfirmDelete(connection)}
										onEdit={() => setEditing(connection)}
										onOpen={() => setEditing(connection)}
										template={templateMap.get(connection.templateSlug)}
									/>
								))}
							</div>
						</section>
					))}
				</div>
			)}
			{editing ? (
				<ConnectionConfigDialog
					connection={editing}
					oauthCallbackUrl={
						settingsQuery.data.publicOrigin
							? `${settingsQuery.data.publicOrigin.replace(/\/$/, "")}/oauth/callback`
							: undefined
					}
					onDelete={() => setConfirmDelete(editing)}
					onOpenChange={(open) => {
						if (!open) setEditing(undefined);
					}}
					open
					template={templateMap.get(editing.templateSlug)}
				/>
			) : null}
			<DeleteConnectionDialog
				connection={confirmDelete}
				onDeleted={() => setEditing(undefined)}
				onOpenChange={(open) => {
					if (!open) setConfirmDelete(undefined);
				}}
			/>
		</>
	);
}

function ConnectionCard({
	connection,
	template,
	onEdit,
	onDelete,
	onOpen,
}: {
	readonly connection: ConnectionView;
	readonly template?: Template;
	readonly onEdit: () => void;
	readonly onDelete: () => void;
	readonly onOpen: () => void;
}) {
	const queryClient = useQueryClient();
	const testConnection = useServerFn(testConnectionForUser);
	const beginOAuth = useServerFn(beginOAuthForUser);
	const connectClientCredentials = useServerFn(connectClientCredentialsForUser);
	const enableConnection = useServerFn(enableConnectionForUser);
	const disableConnection = useServerFn(disableConnectionForUser);
	type Action = "test" | "connect" | "toggle";
	const [pending, setPending] = useState<Record<Action, boolean>>({
		test: false,
		connect: false,
		toggle: false,
	});
	const [message, setMessage] = useState<string>();
	const isOauth = Boolean(template?.capabilities.connect);
	const now = useCurrentTime();
	const expiresAt = connection.accessTokenExpiresAt
		? new Date(connection.accessTokenExpiresAt).getTime()
		: null;
	const refreshAt = connection.refreshDueAt
		? new Date(connection.refreshDueAt).getTime()
		: expiresAt;
	const tokenRemaining = refreshAt === null ? null : refreshAt - now;
	const clientCredentials =
		connection.templateSlug === "generic_oauth2" &&
		connection.config.grant_type === "client_credentials";
	function openFromCard(event: MouseEvent<HTMLDivElement>): void {
		const target = event.target;
		if (
			target instanceof Element &&
			target.closest("button, a, input, textarea, select")
		) {
			return;
		}
		onOpen();
	}
	function openFromKeyboard(event: KeyboardEvent<HTMLDivElement>): void {
		if (event.target !== event.currentTarget) return;
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		onOpen();
	}
	async function run(action: "test" | "connect" | "toggle") {
		setPending((current) => ({ ...current, [action]: true }));
		setMessage(undefined);
		try {
			if (action === "test") {
				const result = await testConnection({
					data: { id: connection.id },
				});
				setMessage(
					result.ok
						? m.verified({ status: result.statusCode })
						: m.verification_failed({ status: result.statusCode }),
				);
			} else if (action === "connect") {
				if (clientCredentials)
					await connectClientCredentials({
						data: { id: connection.id },
					});
				else {
					const result = await beginOAuth({
						data: { id: connection.id },
					});
					window.location.assign(result.authorizationUrl);
					return;
				}
				setMessage(m.connection_credentials_updated());
			} else {
				const result = connection.enabled
					? await disableConnection({ data: { id: connection.id } })
					: await enableConnection({ data: { id: connection.id } });
				queryClient.setQueryData<readonly ConnectionView[]>(
					queryKeys.connections.list(),
					(current) =>
						current?.map((item) =>
							item.id === connection.id
								? { ...item, enabled: result.enabled }
								: item,
						),
				);
				setMessage(
					result.enabled ? m.connection_enabled() : m.connection_disabled(),
				);
			}
			await queryClient.invalidateQueries({
				queryKey: queryKeys.connections.all,
			});
		} catch {
			setMessage(m.action_failed());
		} finally {
			setPending((current) => ({ ...current, [action]: false }));
		}
	}
	return (
		<Card
			aria-label={connection.name}
			className="cursor-pointer transition-colors hover:border-primary/35"
			onClick={openFromCard}
			onKeyDown={openFromKeyboard}
			role="button"
			tabIndex={0}
		>
			<CardHeader className="p-4 pb-2">
				<div className="flex items-start justify-between gap-2">
					<div className="flex min-w-0 items-start gap-3">
						<span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-primary">
							<ProviderIcon
								className="size-4"
								templateSlug={connection.templateSlug}
								protocol={template?.protocol ?? "oidc"}
							/>
						</span>
						<div className="min-w-0">
							<CardTitle className="min-w-0">
								<button
									className="group inline-flex max-w-full items-center gap-1 text-left font-medium outline-none focus-visible:rounded-md focus-visible:ring-3 focus-visible:ring-ring/40"
									onClick={onOpen}
									type="button"
								>
									<span className="truncate">{connection.name}</span>
									<ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
								</button>
							</CardTitle>
							<CardDescription className="mt-1 font-mono text-xs">
								{connection.providerSlug} ·{" "}
								{template ? providerName(template) : connection.templateSlug}
							</CardDescription>
						</div>
					</div>
					<div className="flex max-w-1/2 shrink-0 flex-wrap justify-end gap-1">
						<Badge variant={connection.enabled ? "default" : "outline"}>
							{connection.enabled ? m.enabled() : m.disabled()}
						</Badge>
						<Badge
							variant={
								connection.status === "invalid" ? "destructive" : "secondary"
							}
						>
							{connectionStatusText(connection.status)}
						</Badge>
						<Badge
							variant={
								connection.health === "unhealthy" ? "destructive" : "outline"
							}
						>
							{connectionStatusText(connection.health)}
						</Badge>
					</div>
				</div>
			</CardHeader>
			<CardContent className="grid gap-3 p-4 pt-2 text-sm">
				<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
					<p className="min-w-0 flex-1 truncate font-mono">
						{connection.baseUrl}
					</p>
					<span className="shrink-0">
						{m.last_updated()}: {formatDateTime(connection.updatedAt)}
					</span>
				</div>
				{isOauth ? (
					<div className="flex items-center justify-between gap-3 border-t pt-2 text-xs">
						<span className="text-muted-foreground">{m.token_refresh()}</span>
						<span className="font-medium text-foreground">
							{tokenRemaining === null
								? m.token_not_available()
								: tokenRemaining <= 0
									? m.token_refresh_due()
									: m.token_refresh_in({
											minutes: formatDuration(tokenRemaining),
										})}
						</span>
					</div>
				) : null}
				<div className="flex flex-wrap gap-1.5 border-t pt-3">
					<Button
						disabled={pending.test || !template?.capabilities.test}
						onClick={() => void run("test")}
						size="sm"
						type="button"
						variant="outline"
					>
						<CheckCircle2 /> {pending.test ? m.testing() : m.test()}
					</Button>
					{isOauth ? (
						<Button
							disabled={pending.connect}
							onClick={() => void run("connect")}
							size="sm"
							type="button"
							variant="outline"
						>
							<Link2 />{" "}
							{pending.connect
								? m.connecting()
								: clientCredentials
									? m.get_token()
									: connection.status === "active"
										? m.reconnect()
										: m.connect()}
						</Button>
					) : null}
					<Button
						disabled={pending.toggle}
						onClick={() => void run("toggle")}
						size="sm"
						type="button"
						variant={connection.enabled ? "outline" : "default"}
					>
						{pending.toggle ? (
							<LoaderCircle className="animate-spin" />
						) : connection.enabled ? (
							<ToggleRight />
						) : (
							<ToggleLeft />
						)}{" "}
						{pending.toggle
							? connection.enabled
								? m.disabling()
								: m.enabling()
							: connection.enabled
								? m.disable()
								: m.enable()}
					</Button>
					<Button onClick={onEdit} size="sm" type="button" variant="ghost">
						<Pencil /> {m.edit()}
					</Button>
					<Button onClick={onDelete} size="sm" type="button" variant="ghost">
						<Trash2 /> {m.delete()}
					</Button>
				</div>
				{message ? (
					<output className="text-xs text-muted-foreground">{message}</output>
				) : null}
			</CardContent>
		</Card>
	);
}
