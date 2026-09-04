import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
	Ban,
	CalendarClock,
	Check,
	ChevronLeft,
	ChevronRight,
	Copy,
	KeyRound,
	Pencil,
	Plus,
	Search,
	Trash2,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { PageHeader } from "#/components/layout/app-shell";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	createApiKeyForUser,
	deleteApiKeyForUser,
	revokeApiKeyForUser,
	updateApiKeyForUser,
} from "#/features/api-keys/api-keys.functions";
import {
	type ApiKeyListResult,
	type ApiKeyPermission,
	type ApiKeyView,
	apiKeyPermissions,
} from "#/features/api-keys/api-keys.types";
import type { ApiKeysQueryInput } from "#/lib/api";
import { apiKeyScopeOptions, apiKeysQueryOptions, queryKeys } from "#/lib/api";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";

type KeyStatus = "active" | "expired" | "revoked";
type ProviderSelectionFilter = "all" | "selected" | "unselected";
type SortKey = "prefix" | "label" | "expiresAt" | "status";
type ApiKeysSearch = {
	readonly search: string;
	readonly permission: ApiKeyPermission | "all";
	readonly status: "all" | KeyStatus;
	readonly page: number;
	readonly sort: SortKey;
	readonly direction: "asc" | "desc";
};

function parseApiKeysSearch(input: Record<string, unknown>): ApiKeysSearch {
	const page = Number(input.page);
	const sort = input.sort;
	const status = input.status;
	const permission =
		typeof input.permission === "string" &&
		apiKeyPermissions.includes(input.permission as ApiKeyPermission)
			? (input.permission as ApiKeyPermission)
			: "all";
	return {
		search: typeof input.search === "string" ? input.search : "",
		permission,
		status:
			status === "active" || status === "expired" || status === "revoked"
				? status
				: "all",
		page: Number.isInteger(page) && page >= 0 ? page : 0,
		sort:
			sort === "label" || sort === "expiresAt" || sort === "status"
				? sort
				: "prefix",
		direction: input.direction === "desc" ? "desc" : "asc",
	};
}

function queryInput(search: ApiKeysSearch): ApiKeysQueryInput {
	return {
		search: search.search,
		permission: search.permission === "all" ? undefined : search.permission,
		status: search.status,
		page: search.page,
		pageSize: 8,
		sort: search.sort,
		direction: search.direction,
	};
}

function parsePermission(value: string): ApiKeysSearch["permission"] {
	return apiKeyPermissions.includes(value as ApiKeyPermission)
		? (value as ApiKeyPermission)
		: "all";
}

function matchesListInput(key: ApiKeyView, input: ApiKeysQueryInput): boolean {
	const search = input.search?.trim().toLowerCase();
	if (search) {
		const haystack = [
			key.label,
			key.prefix,
			...key.providerSlugs,
			...key.permissions,
		]
			.join(" ")
			.toLowerCase();
		if (!haystack.includes(search)) return false;
	}
	if (
		input.permission &&
		input.permission !== "all" &&
		!key.permissions.includes(input.permission)
	) {
		return false;
	}
	return (
		!input.status || input.status === "all" || statusOf(key) === input.status
	);
}

function compareKeys(
	left: ApiKeyView,
	right: ApiKeyView,
	input: ApiKeysQueryInput,
): number {
	const sort = input.sort ?? "prefix";
	const direction = input.direction === "desc" ? -1 : 1;
	const leftValue =
		sort === "expiresAt"
			? (left.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY)
			: sort === "status"
				? statusOf(left)
				: left[sort];
	const rightValue =
		sort === "expiresAt"
			? (right.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY)
			: sort === "status"
				? statusOf(right)
				: right[sort];
	const result = String(leftValue).localeCompare(
		String(rightValue),
		undefined,
		{
			numeric: true,
		},
	);
	return result === 0
		? right.createdAt.getTime() - left.createdAt.getTime()
		: result * direction;
}

function sortItems(
	items: readonly ApiKeyView[],
	input: ApiKeysQueryInput,
): ApiKeyView[] {
	return [...items].sort((left, right) => compareKeys(left, right, input));
}

export const Route = createFileRoute("/_authenticated/api-keys/")({
	validateSearch: parseApiKeysSearch,
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) =>
		Promise.all([
			context.queryClient.ensureQueryData(
				apiKeysQueryOptions(queryInput(deps)),
			),
			context.queryClient.ensureQueryData(apiKeyScopeOptions()),
		]),
	component: ApiKeysPage,
});

type KeyForm = {
	label: string;
	permissions: ApiKeyPermission[];
	providerScopeMode: "all" | "selected";
	providerSlugs: string[];
	instanceIds: string[];
	expiresAt: string;
};
const emptyForm: KeyForm = {
	label: "",
	permissions: ["proxy"],
	providerScopeMode: "all",
	providerSlugs: [],
	instanceIds: [],
	expiresAt: "",
};

const permissionGroups: readonly {
	labelKey:
		| "proxy"
		| "connections_permission"
		| "api_keys_permission"
		| "audit_permission"
		| "statistics_permission"
		| "settings_permission";
	options: readonly { value: ApiKeyPermission }[];
}[] = [
	{ labelKey: "proxy", options: [{ value: "proxy" }] },
	{
		labelKey: "connections_permission",
		options: [{ value: "connections:read" }, { value: "connections:write" }],
	},
	{
		labelKey: "api_keys_permission",
		options: [{ value: "api_keys:read" }, { value: "api_keys:write" }],
	},
	{ labelKey: "audit_permission", options: [{ value: "audit:read" }] },
	{
		labelKey: "statistics_permission",
		options: [{ value: "statistics:read" }],
	},
	{
		labelKey: "settings_permission",
		options: [{ value: "settings:read" }, { value: "settings:write" }],
	},
];
const permissionDependencies: Partial<
	Record<ApiKeyPermission, ApiKeyPermission>
> = {
	"connections:write": "connections:read",
	"api_keys:write": "api_keys:read",
	"settings:write": "settings:read",
};

function permissionGroupLabel(
	key: (typeof permissionGroups)[number]["labelKey"],
): string {
	const labels: Record<(typeof permissionGroups)[number]["labelKey"], string> =
		{
			proxy: m.proxy(),
			connections_permission: m.connections_permission(),
			api_keys_permission: m.api_keys_permission(),
			audit_permission: m.audit_permission(),
			statistics_permission: m.statistics_permission(),
			settings_permission: m.settings_permission(),
		};
	return labels[key] ?? key;
}

function permissionLabel(value: ApiKeyPermission): string {
	const labels: Record<ApiKeyPermission, string> = {
		proxy: m.proxy(),
		"connections:read": `${m.connections_permission()} ${m.read()}`,
		"connections:write": `${m.connections_permission()} ${m.write()}`,
		"api_keys:read": `${m.api_keys_permission()} ${m.read()}`,
		"api_keys:write": `${m.api_keys_permission()} ${m.write()}`,
		"audit:read": `${m.audit_permission()} ${m.read()}`,
		"statistics:read": `${m.statistics_permission()} ${m.read()}`,
		"settings:read": `${m.settings_permission()} ${m.read()}`,
		"settings:write": `${m.settings_permission()} ${m.write()}`,
	};
	return labels[value];
}

function statusOf(key: ApiKeyView): KeyStatus {
	if (key.revokedAt) return "revoked";
	if (key.expiresAt && key.expiresAt <= new Date()) return "expired";
	return "active";
}

function statusLabel(status: KeyStatus): string {
	switch (status) {
		case "active":
			return m.active();
		case "expired":
			return m.expired();
		case "revoked":
			return m.revoked();
	}
}

function expiryInput(value: Date | null): string {
	if (!value) return "";
	const date = new Date(value);
	return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
		.toISOString()
		.slice(0, 16);
}

function formatDate(value: Date | string, withTime = false): string {
	return new Intl.DateTimeFormat(getLocale(), {
		dateStyle: "medium",
		...(withTime ? { timeStyle: "short" as const } : {}),
	}).format(new Date(value));
}

function togglePermission(
	values: ApiKeyPermission[],
	permission: ApiKeyPermission,
) {
	if (values.includes(permission)) {
		const dependency = Object.entries(permissionDependencies).find(
			([, read]) => read === permission,
		)?.[0];
		return values.filter(
			(value) => value !== permission && value !== dependency,
		);
	}
	const dependency = permissionDependencies[permission];
	return dependency && !values.includes(dependency)
		? [...values, dependency, permission]
		: [...values, permission];
}

function toggleValue(values: string[], value: string): string[] {
	return values.includes(value)
		? values.filter((item) => item !== value)
		: [...values, value];
}

function PolicyForm({
	form,
	scope,
	pending,
	error,
	onChange,
	onSubmit,
	onCancel,
}: {
	form: KeyForm;
	scope:
		| {
				providers: string[];
				instances: { id: string; providerSlug: string; name: string }[];
		  }
		| undefined;
	pending: boolean;
	error?: string;
	onChange: (form: KeyForm) => void;
	onSubmit: () => void;
	onCancel: () => void;
}) {
	const [providerSearch, setProviderSearch] = useState("");
	const [providerFilter, setProviderFilter] =
		useState<ProviderSelectionFilter>("all");
	const providers = (scope?.providers ?? []).filter(
		(provider) =>
			provider.toLowerCase().includes(providerSearch.toLowerCase()) &&
			(providerFilter === "all" ||
				(providerFilter === "selected" &&
					form.providerSlugs.includes(provider)) ||
				(providerFilter === "unselected" &&
					!form.providerSlugs.includes(provider))),
	);
	const instances = (scope?.instances ?? []).filter(
		(item) =>
			form.providerScopeMode === "all" ||
			form.providerSlugs.includes(item.providerSlug),
	);
	return (
		<form
			className="grid gap-5"
			onSubmit={(event: FormEvent) => {
				event.preventDefault();
				onSubmit();
			}}
		>
			<div className="grid gap-5 lg:grid-cols-2">
				<div className="grid content-start gap-4">
					<div className="grid gap-2">
						<Label htmlFor="key-label">{m.label()}</Label>
						<Input
							id="key-label"
							value={form.label}
							onChange={(event) =>
								onChange({ ...form, label: event.target.value })
							}
							required
							maxLength={120}
						/>
					</div>
					<div className="grid gap-2">
						<Label>{m.provider_scope()}</Label>
						<Select
							value={form.providerScopeMode}
							onValueChange={(value) =>
								onChange({
									...form,
									providerScopeMode: value as KeyForm["providerScopeMode"],
									providerSlugs: value === "all" ? [] : form.providerSlugs,
								})
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">{m.all_providers()}</SelectItem>
								<SelectItem value="selected">
									{m.selected_providers()}
								</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{form.providerScopeMode === "selected" ? (
						<div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
							<div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
								<Input
									value={providerSearch}
									onChange={(event) => setProviderSearch(event.target.value)}
									placeholder={m.search_providers()}
									aria-label={m.search_providers()}
								/>
								<Select
									value={providerFilter}
									onValueChange={(value) =>
										setProviderFilter(value as ProviderSelectionFilter)
									}
								>
									<SelectTrigger aria-label={m.provider_scope()}>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">{m.all_providers()}</SelectItem>
										<SelectItem value="selected">
											{m.selected_providers()}
										</SelectItem>
										<SelectItem value="unselected">
											{m.unselected_providers()}
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="grid max-h-40 gap-2 overflow-auto sm:grid-cols-2">
								{providers.map((provider) => (
									<Button
										key={provider}
										type="button"
										variant={
											form.providerSlugs.includes(provider)
												? "secondary"
												: "outline"
										}
										className="justify-between"
										aria-pressed={form.providerSlugs.includes(provider)}
										onClick={() =>
											onChange({
												...form,
												providerSlugs: toggleValue(
													form.providerSlugs,
													provider,
												),
												instanceIds: form.providerSlugs.includes(provider)
													? form.instanceIds.filter(
															(id) =>
																scope?.instances.find((item) => item.id === id)
																	?.providerSlug !== provider,
														)
													: form.instanceIds,
											})
										}
									>
										<span className="truncate">{provider}</span>
										{form.providerSlugs.includes(provider) ? <Check /> : null}
									</Button>
								))}
							</div>
							{providers.length === 0 ? (
								<p className="text-xs text-muted-foreground">
									{m.no_providers_available()}
								</p>
							) : null}
						</div>
					) : null}
					{instances.length > 0 ? (
						<div className="grid gap-2">
							<Label>{m.instance_restrictions()}</Label>
							<div className="grid max-h-36 gap-2 overflow-auto rounded-lg border bg-muted/30 p-3">
								{instances.map((item) => (
									<Button
										key={item.id}
										type="button"
										size="sm"
										variant={
											form.instanceIds.includes(item.id)
												? "secondary"
												: "outline"
										}
										className="justify-start"
										onClick={() =>
											onChange({
												...form,
												instanceIds: toggleValue(form.instanceIds, item.id),
											})
										}
									>
										{item.name}{" "}
										<span className="text-xs text-muted-foreground">
											({item.providerSlug})
										</span>
									</Button>
								))}
							</div>
							<p className="text-xs text-muted-foreground">
								{m.leave_empty_every_instance()}
							</p>
						</div>
					) : null}
				</div>
				<div className="grid content-start gap-4">
					<div className="grid gap-3">
						<Label>{m.permissions()}</Label>
						{permissionGroups.map((group) => (
							<div className="grid gap-1.5" key={group.labelKey}>
								<span className="text-xs font-medium text-muted-foreground">
									{permissionGroupLabel(group.labelKey)}
								</span>
								<div className="grid gap-2 sm:grid-cols-2">
									{group.options.map((option) => {
										const selected = form.permissions.includes(option.value);
										return (
											<Button
												key={option.value}
												type="button"
												variant={selected ? "secondary" : "outline"}
												className="justify-start"
												aria-pressed={selected}
												onClick={() =>
													onChange({
														...form,
														permissions: togglePermission(
															form.permissions,
															option.value,
														),
													})
												}
											>
												{selected ? <Check /> : null}
												{permissionLabel(option.value)}
											</Button>
										);
									})}
								</div>
							</div>
						))}
					</div>
					<div className="grid gap-2">
						<Label htmlFor="key-expiry">{m.expiration()}</Label>
						<div className="relative">
							<CalendarClock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								id="key-expiry"
								type="datetime-local"
								className="pl-9"
								value={form.expiresAt}
								onChange={(event) =>
									onChange({ ...form, expiresAt: event.target.value })
								}
							/>
						</div>
						<p className="text-xs text-muted-foreground">
							{m.leave_blank_no_expiration()}
						</p>
					</div>
				</div>
			</div>
			{error ? (
				<p className="text-sm text-destructive" role="alert">
					{error}
				</p>
			) : null}
			<DialogFooter>
				<Button type="button" variant="outline" onClick={onCancel}>
					{m.cancel()}
				</Button>
				<Button type="submit" disabled={pending}>
					{pending ? m.saving() : m.save_policy()}
				</Button>
			</DialogFooter>
		</form>
	);
}

function ApiKeysPage() {
	const queryClient = useQueryClient();
	const scopeQuery = useSuspenseQuery(apiKeyScopeOptions());
	const createApiKey = useServerFn(createApiKeyForUser);
	const updateApiKey = useServerFn(updateApiKeyForUser);
	const revokeApiKey = useServerFn(revokeApiKeyForUser);
	const deleteApiKey = useServerFn(deleteApiKeyForUser);
	const searchParams = Route.useSearch();
	const navigate = Route.useNavigate();
	const [searchInput, setSearchInput] = useState(searchParams.search);
	const { search, permission, status, page } = searchParams;
	const sortKey = searchParams.sort;
	const sortDirection = searchParams.direction;
	const listInput = queryInput(searchParams);
	const keysQuery = useSuspenseQuery(apiKeysQueryOptions(listInput));
	useEffect(() => setSearchInput(search), [search]);
	useEffect(() => {
		const timer = window.setTimeout(() => {
			if (searchInput === search) return;
			void navigate({
				search: (current) => ({
					...current,
					search: searchInput,
					page: 0,
				}),
				replace: true,
			});
		}, 250);
		return () => window.clearTimeout(timer);
	}, [navigate, search, searchInput]);
	const [editorOpen, setEditorOpen] = useState(false);
	const [editing, setEditing] = useState<ApiKeyView | undefined>();
	const [form, setForm] = useState<KeyForm>(emptyForm);
	const [deleteTarget, setDeleteTarget] = useState<ApiKeyView | undefined>();
	const [revokeTarget, setRevokeTarget] = useState<ApiKeyView | undefined>();
	const [secret, setSecret] = useState<string | null>(null);
	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all });
	const create = useMutation({
		mutationFn: (value: KeyForm) =>
			createApiKey({
				data: {
					label: value.label,
					permissions: value.permissions,
					providerScopeMode: value.providerScopeMode,
					providerSlugs: value.providerSlugs,
					instanceIds: value.instanceIds,
					expiresAt: value.expiresAt ? new Date(value.expiresAt) : null,
				},
			}),
	});
	const update = useMutation({
		mutationFn: (value: KeyForm) => {
			if (!editing) throw new Error();
			return updateApiKey({
				data: {
					id: editing.id,
					label: value.label,
					permissions: value.permissions,
					providerScopeMode: value.providerScopeMode,
					providerSlugs: value.providerSlugs,
					instanceIds: value.instanceIds,
					expiresAt: value.expiresAt ? new Date(value.expiresAt) : null,
				},
			});
		},
	});
	const revoke = useMutation({
		mutationFn: (id: string) => revokeApiKey({ data: { id } }),
	});
	const remove = useMutation({
		mutationFn: (id: string) => deleteApiKey({ data: { id } }),
	});
	const policyPending = create.isPending || update.isPending;

	async function submitPolicy(): Promise<void> {
		try {
			if (editing) {
				const updated = await update.mutateAsync(form);
				queryClient.setQueryData<ApiKeyListResult>(
					queryKeys.apiKeys.list(listInput),
					(current) =>
						current
							? {
									...current,
									items: current.items.map((item) =>
										item.id === updated.id ? updated : item,
									),
								}
							: current,
				);
				await invalidate();
				setEditing(undefined);
			} else {
				const created = await create.mutateAsync(form);
				const createdView: ApiKeyView = {
					id: created.id,
					label: created.label,
					prefix: created.prefix,
					permissions: created.permissions,
					providerScopeMode: created.providerScopeMode,
					providerSlugs: created.providerSlugs,
					instanceIds: created.instanceIds,
					expiresAt: created.expiresAt,
					revokedAt: created.revokedAt,
					lastUsedAt: created.lastUsedAt,
					createdAt: created.createdAt,
				};
				queryClient.setQueryData<ApiKeyListResult>(
					queryKeys.apiKeys.list(listInput),
					(current) => {
						if (!current || !matchesListInput(createdView, listInput)) {
							return current;
						}
						const allItems = sortItems(
							[...current.items, createdView],
							listInput,
						);
						return {
							...current,
							items: allItems.slice(0, current.pageSize),
							total: current.total + 1,
							pageCount: Math.max(
								1,
								Math.ceil((current.total + 1) / current.pageSize),
							),
						};
					},
				);
				await invalidate();
				setForm(emptyForm);
				setSecret(created.secret);
			}
			setEditorOpen(false);
		} catch {}
	}

	async function confirmRevoke(): Promise<void> {
		if (!revokeTarget) return;
		try {
			await revoke.mutateAsync(revokeTarget.id);
			queryClient.setQueryData<ApiKeyListResult>(
				queryKeys.apiKeys.list(listInput),
				(current) => {
					if (!current) return current;
					const items = current.items.map((item) =>
						item.id === revokeTarget.id
							? { ...item, revokedAt: new Date() }
							: item,
					);
					const nextItems = items.filter((item) =>
						matchesListInput(item, listInput),
					);
					return {
						...current,
						items: nextItems.length === items.length ? nextItems : nextItems,
						total:
							items.length === nextItems.length
								? current.total
								: Math.max(0, current.total - 1),
						pageCount:
							items.length === nextItems.length
								? current.pageCount
								: Math.max(
										1,
										Math.ceil(
											Math.max(0, current.total - 1) / current.pageSize,
										),
									),
					};
				},
			);
			await invalidate();
			setRevokeTarget(undefined);
		} catch {}
	}

	async function confirmDelete(): Promise<void> {
		if (!deleteTarget) return;
		try {
			await remove.mutateAsync(deleteTarget.id);
			queryClient.setQueryData<ApiKeyListResult>(
				queryKeys.apiKeys.list(listInput),
				(current) =>
					current
						? {
								...current,
								items: current.items.filter(
									(item) => item.id !== deleteTarget.id,
								),
								total: Math.max(0, current.total - 1),
							}
						: current,
			);
			await invalidate();
			setDeleteTarget(undefined);
		} catch {}
	}

	function closeEditor() {
		if (!policyPending) setEditorOpen(false);
	}

	function openRevoke(key: ApiKeyView) {
		revoke.reset();
		setRevokeTarget(key);
	}

	function closeRevoke() {
		if (!revoke.isPending) setRevokeTarget(undefined);
	}

	function openDelete(key: ApiKeyView) {
		remove.reset();
		setDeleteTarget(key);
	}

	function closeDelete() {
		if (!remove.isPending) setDeleteTarget(undefined);
	}
	const pageCount = keysQuery.data.pageCount;
	const safePage = Math.min(page, pageCount - 1);
	const rows = keysQuery.data.items;
	const hasKeys = keysQuery.data.total > 0;
	useEffect(() => {
		if (page <= safePage) return;
		void navigate({
			search: (current) => ({ ...current, page: safePage }),
			replace: true,
		});
	}, [navigate, page, safePage]);
	function openCreate() {
		setEditing(undefined);
		setForm(emptyForm);
		create.reset();
		update.reset();
		setEditorOpen(true);
	}
	function openEdit(key: ApiKeyView) {
		setEditing(key);
		setForm({
			label: key.label,
			permissions: [...key.permissions],
			providerScopeMode: key.providerScopeMode,
			providerSlugs: [...key.providerSlugs],
			instanceIds: [...key.instanceIds],
			expiresAt: expiryInput(key.expiresAt),
		});
		create.reset();
		update.reset();
		setEditorOpen(true);
	}
	function toggleSort(key: SortKey) {
		void navigate({
			search: (current) => ({
				...current,
				page: 0,
				sort: key,
				direction:
					current.sort === key && current.direction !== "desc" ? "desc" : "asc",
			}),
		});
	}
	const error = (editing ? update.error : create.error)
		? m.action_failed()
		: undefined;
	return (
		<>
			<PageHeader
				title={m.api_keys()}
				description={m.api_keys_description()}
				actions={
					<Button onClick={openCreate}>
						<Plus /> {m.new_api_key()}
					</Button>
				}
			/>
			<div className="mb-4 flex flex-wrap gap-2">
				<div className="relative min-w-56 flex-1">
					<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						className="pl-9"
						value={searchInput}
						onChange={(event) => {
							setSearchInput(event.target.value);
						}}
						placeholder={m.search_keys_scopes()}
						aria-label={m.search_keys_scopes()}
					/>
				</div>
				<Select
					value={permission}
					onValueChange={(value) => {
						void navigate({
							search: (current) => ({
								...current,
								permission: parsePermission(value),
								page: 0,
							}),
						});
					}}
				>
					<SelectTrigger className="w-40" aria-label={m.all_permissions()}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">{m.all_permissions()}</SelectItem>
						{apiKeyPermissions.map((value) => (
							<SelectItem key={value} value={value}>
								{permissionLabel(value)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={status}
					onValueChange={(value) => {
						void navigate({
							search: (current) => ({
								...current,
								status:
									value === "active" ||
									value === "expired" ||
									value === "revoked"
										? value
										: "all",
								page: 0,
							}),
						});
					}}
				>
					<SelectTrigger className="w-32" aria-label={m.all_status()}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">{m.all_status()}</SelectItem>
						<SelectItem value="active">{m.active()}</SelectItem>
						<SelectItem value="expired">{m.expired()}</SelectItem>
						<SelectItem value="revoked">{m.revoked()}</SelectItem>
					</SelectContent>
				</Select>
			</div>
			<Card>
				<CardContent className="p-0">
					{rows.length === 0 ? (
						<div className="flex min-h-56 flex-col items-center justify-center gap-2 p-6 text-center">
							<KeyRound className="size-8 text-muted-foreground" />
							<p className="font-medium">
								{hasKeys ? m.no_keys_match() : m.no_api_keys_yet()}
							</p>
							<Button
								variant="outline"
								onClick={
									hasKeys
										? () => {
												setSearchInput("");
												void navigate({
													search: (current) => ({
														...current,
														search: "",
														permission: "all",
														status: "all",
														page: 0,
													}),
												});
											}
										: openCreate
								}
							>
								{hasKeys ? m.clear_filters() : m.create_a_key()}
							</Button>
						</div>
					) : (
						<>
							<div className="overflow-x-auto">
								<table className="w-full text-sm">
									<thead className="border-b">
										<tr>
											{(
												["prefix", "label", "expiresAt", "status"] as SortKey[]
											).map((key) => (
												<th
													className="h-10 px-3 text-left font-medium"
													key={key}
												>
													<button
														type="button"
														className="inline-flex items-center gap-1"
														onClick={() => toggleSort(key)}
													>
														{key === "expiresAt"
															? m.expires()
															: key === "status"
																? m.status()
																: key === "prefix"
																	? m.prefix()
																	: m.label()}
														{sortKey === key ? (
															<span>{sortDirection === "asc" ? "↑" : "↓"}</span>
														) : null}
													</button>
												</th>
											))}
											<th className="h-10 px-3 text-left font-medium">
												{m.permissions_scope()}
											</th>
											<th className="h-10 px-3 text-right font-medium">
												{m.actions()}
											</th>
										</tr>
									</thead>
									<tbody>
										{rows.map((key) => {
											const keyStatus = statusOf(key);
											return (
												<tr className="border-b last:border-0" key={key.id}>
													<td className="p-3">
														<code>{key.prefix}</code>
													</td>
													<td className="p-3">
														<div className="font-medium">{key.label}</div>
														<div className="text-xs text-muted-foreground">
															{m.created()} {formatDate(key.createdAt)}
														</div>
													</td>
													<td className="p-3">
														{key.expiresAt ? (
															formatDate(key.expiresAt, true)
														) : (
															<span className="text-muted-foreground">
																{m.never_expires()}
															</span>
														)}
													</td>
													<td className="p-3">
														<Badge
															variant={
																keyStatus === "active" ? "secondary" : "outline"
															}
														>
															{statusLabel(keyStatus)}
														</Badge>
													</td>
													<td className="max-w-72 p-3">
														<div className="flex flex-wrap gap-1">
															{key.permissions.map((value) => (
																<Badge variant="secondary" key={value}>
																	{permissionLabel(value)}
																</Badge>
															))}
														</div>
														<div className="mt-1 truncate text-xs text-muted-foreground">
															{key.providerScopeMode === "all"
																? m.all_providers()
																: key.providerSlugs.join(", ") ||
																	m.no_providers()}
															{key.instanceIds.length
																? ` · ${m.instance_restriction_count({ count: key.instanceIds.length })}`
																: ""}
														</div>
													</td>
													<td className="p-3 text-right">
														<div className="flex justify-end gap-1">
															<Button
																variant="ghost"
																size="icon-sm"
																aria-label={`${m.edit()} ${key.prefix}`}
																onClick={() => openEdit(key)}
																disabled={keyStatus === "revoked"}
															>
																<Pencil />
															</Button>
															{keyStatus === "active" ? (
																<Button
																	variant="ghost"
																	size="icon-sm"
																	aria-label={`${m.revoke()} ${key.prefix}`}
																	onClick={() => openRevoke(key)}
																	disabled={revoke.isPending}
																>
																	<Ban />
																</Button>
															) : null}
															<Button
																variant="ghost"
																size="icon-sm"
																aria-label={`${m.delete()} ${key.prefix}`}
																onClick={() => openDelete(key)}
															>
																<Trash2 />
															</Button>
														</div>
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
							<div className="flex items-center justify-between border-t px-3 py-2 text-sm text-muted-foreground">
								<span>{m.keys_count({ count: keysQuery.data.total })}</span>
								<div className="flex items-center gap-1">
									<Button
										variant="ghost"
										size="icon-sm"
										onClick={() =>
											void navigate({
												search: (current) => ({
													...current,
													page: Math.max(0, current.page - 1),
												}),
											})
										}
										disabled={safePage === 0}
										aria-label={m.previous_page()}
									>
										<ChevronLeft />
										<span className="sr-only">{m.previous_page()}</span>
									</Button>
									<span>
										{safePage + 1} / {pageCount}
									</span>
									<Button
										variant="ghost"
										size="icon-sm"
										onClick={() =>
											void navigate({
												search: (current) => ({
													...current,
													page: Math.min(pageCount - 1, current.page + 1),
												}),
											})
										}
										disabled={safePage >= pageCount - 1}
										aria-label={m.next_page()}
									>
										<ChevronRight />
										<span className="sr-only">{m.next_page()}</span>
									</Button>
								</div>
							</div>
						</>
					)}
				</CardContent>
			</Card>
			<Dialog
				open={editorOpen}
				onOpenChange={(open) => {
					if (!open) closeEditor();
				}}
			>
				<DialogContent className="max-h-[90svh] max-w-6xl overflow-y-auto">
					<DialogHeader>
						<DialogTitle>
							{editing ? m.edit_api_key_policy() : m.create_api_key()}
						</DialogTitle>
						<DialogDescription>
							{editing
								? m.update_access_policy({ prefix: editing.prefix })
								: m.api_key_secret_once()}
						</DialogDescription>
					</DialogHeader>
					<PolicyForm
						form={form}
						scope={scopeQuery.data}
						pending={policyPending}
						error={error}
						onChange={setForm}
						onSubmit={() => void submitPolicy()}
						onCancel={closeEditor}
					/>
				</DialogContent>
			</Dialog>
			<Dialog
				open={Boolean(revokeTarget)}
				onOpenChange={(open) => {
					if (!open) closeRevoke();
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{revokeTarget
								? m.revoke_key_title({ prefix: revokeTarget.prefix })
								: m.revoked()}
						</DialogTitle>
						<DialogDescription>{m.revoke_key_description()}</DialogDescription>
					</DialogHeader>
					{revoke.error ? (
						<p className="text-sm text-destructive" role="alert">
							{m.action_failed()}
						</p>
					) : null}
					<DialogFooter>
						<Button
							variant="outline"
							onClick={closeRevoke}
							disabled={revoke.isPending}
						>
							{m.cancel()}
						</Button>
						<Button
							variant="destructive"
							disabled={revoke.isPending}
							onClick={() => void confirmRevoke()}
						>
							{revoke.isPending ? m.revoking() : m.revoke()}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<Dialog
				open={Boolean(secret)}
				onOpenChange={(open) => {
					if (!open) setSecret(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{m.copy_api_key_secret()}</DialogTitle>
						<DialogDescription>{m.secret_not_shown_again()}</DialogDescription>
					</DialogHeader>
					<code className="break-all rounded-lg border bg-muted p-3 text-xs">
						{secret}
					</code>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								if (secret) void navigator.clipboard.writeText(secret);
							}}
						>
							<Copy /> {m.copy_secret()}
						</Button>
						<Button onClick={() => setSecret(null)}>{m.done()}</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			<Dialog
				open={Boolean(deleteTarget)}
				onOpenChange={(open) => {
					if (!open) closeDelete();
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{deleteTarget
								? m.delete_key_title({ prefix: deleteTarget.prefix })
								: m.delete()}
						</DialogTitle>
						<DialogDescription>{m.delete_key_description()}</DialogDescription>
					</DialogHeader>
					{remove.error ? (
						<p className="text-sm text-destructive" role="alert">
							{m.action_failed()}
						</p>
					) : null}
					<DialogFooter>
						<Button
							variant="outline"
							onClick={closeDelete}
							disabled={remove.isPending}
						>
							{m.cancel()}
						</Button>
						<Button
							variant="destructive"
							disabled={remove.isPending}
							onClick={() => void confirmDelete()}
						>
							{remove.isPending ? m.deleting() : m.delete()}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
