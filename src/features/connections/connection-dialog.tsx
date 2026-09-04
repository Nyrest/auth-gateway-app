import { useDebouncedValue } from "@tanstack/react-pacer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	ArrowRight,
	Grid2X2,
	List,
	LoaderCircle,
	Plus,
	Search,
	Trash2,
} from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
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
import { Textarea } from "#/components/ui/textarea";
import { connectionDetailsQueryOptions, queryKeys } from "#/lib/api";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";
import {
	createConnectionForUser,
	type listProviderTemplates,
	updateConnectionForUser,
} from "./connections.functions";
import { asJsonObject, type ConnectionView } from "./connections.types";
import { ProviderIcon } from "./provider-icon";
import {
	fieldDescription,
	fieldLabel,
	fieldOptionLabel,
	providerDescription,
	providerName,
} from "./provider-text";

export type Template = Awaited<
	ReturnType<typeof listProviderTemplates>
>[number];
type ConnectionForm = { name: string; providerSlug: string; baseUrl: string };
type ConfigValues = Record<string, string>;
type TemplatePickerRow =
	| {
			readonly kind: "heading";
			readonly key: string;
			readonly title: string;
			readonly count: number;
	  }
	| {
			readonly kind: "templates";
			readonly key: string;
			readonly templates: readonly Template[];
	  };

class ConnectionValidationError extends Error {}

function statusLabel(value: string): string {
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

function displayDefault(value: unknown): string {
	if (value === undefined || value === null) return "";
	if (typeof value === "string") return value;
	if (typeof value === "boolean") return String(value);
	return JSON.stringify(value);
}

function configInputValue(value: unknown): string {
	if (value === undefined || value === null) return "";
	if (typeof value === "string") return value;
	if (typeof value === "boolean" || typeof value === "number")
		return String(value);
	return JSON.stringify(value);
}

function parseConfigValue(
	field: Template["fields"][number],
	value: string,
): unknown {
	if (!value.trim()) {
		if (field.type === "boolean") return false;
		if (field.type === "multi_select") return [];
		return value;
	}
	if (field.type === "number") {
		const number = Number(value);
		if (!Number.isFinite(number))
			throw new ConnectionValidationError(
				m.invalid_number({ field: fieldLabel(field) }),
			);
		return number;
	}
	if (field.type === "boolean") return value === "true";
	if (field.type === "json" || field.type === "multi_select") {
		try {
			return JSON.parse(value);
		} catch {
			throw new ConnectionValidationError(
				m.invalid_json({ field: fieldLabel(field) }),
			);
		}
	}
	if (field.type === "key_value") {
		return value
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => {
				const separator = line.indexOf(":");
				if (separator < 1)
					throw new ConnectionValidationError(
						m.invalid_key_value({ field: fieldLabel(field) }),
					);
				return {
					key: line.slice(0, separator).trim(),
					value: line.slice(separator + 1).trim(),
				};
			});
	}
	return value;
}

function formatConfigValue(
	field: Template["fields"][number],
	value: string,
): string {
	if (field.type === "key_value" && value) {
		try {
			const parsed = JSON.parse(value) as unknown;
			if (Array.isArray(parsed))
				return parsed
					.filter((item): item is { key: string; value: string } =>
						Boolean(
							item &&
								typeof item === "object" &&
								"key" in item &&
								"value" in item,
						),
					)
					.map((item) => `${item.key}: ${item.value}`)
					.join("\n");
		} catch {
			/* Keep a legacy plain-text value visible. */
		}
	}
	return value;
}

function formatDateTime(value: Date | string): string {
	return new Intl.DateTimeFormat(getLocale(), {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function templateBadges(template: Template): readonly string[] {
	if (template.category !== "predefined") return [];

	return [
		template.capabilities.connect ? "OAuth" : null,
		template.mcp ? "MCP" : null,
	].filter((badge): badge is string => badge !== null);
}

export function TemplatePicker({
	templates,
	open,
	onOpenChange,
	onSelect,
}: {
	readonly templates: readonly Template[];
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly onSelect: (template: Template) => void;
}) {
	const [search, setSearch] = useState("");
	const [compact, setCompact] = useState(false);
	const [debouncedSearch] = useDebouncedValue(search, { wait: 180 });
	const query = debouncedSearch.trim().toLowerCase();
	const visible = useMemo(
		() =>
			templates.filter(
				(template) =>
					!query ||
					[
						providerName(template),
						template.slug,
						providerDescription(template),
						template.protocol,
						template.category,
					]
						.join(" ")
						.toLowerCase()
						.includes(query),
			),
		[query, templates],
	);
	const predefined = visible.filter(
		(template) => template.category === "predefined",
	);
	const generic = visible.filter((template) => template.category === "generic");
	const lanes = useTemplateLanes(compact);
	const rows = useMemo<TemplatePickerRow[]>(
		() =>
			[
				{
					key: "predefined",
					title: m.predefined(),
					templates: predefined,
				},
				{
					key: "generic",
					title: m.generic(),
					templates: generic,
				},
			].flatMap(({ key, title, templates }) => {
				if (templates.length === 0) return [];
				const templateRows: TemplatePickerRow[] = [
					{
						kind: "heading",
						key,
						title,
						count: templates.length,
					},
				];
				for (let index = 0; index < templates.length; index += lanes) {
					templateRows.push({
						kind: "templates",
						key: `${key}-${index}`,
						templates: templates.slice(index, index + lanes),
					});
				}
				return templateRows;
			}),
		[generic, lanes, predefined],
	);
	useEffect(() => {
		if (!open) {
			setSearch("");
			setCompact(false);
		}
	}, [open]);
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[88svh] max-w-6xl overflow-hidden">
				<DialogHeader>
					<DialogTitle>{m.add_connection()}</DialogTitle>
					<DialogDescription>{m.choose_provider_template()}</DialogDescription>
				</DialogHeader>
				<div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2">
					<div className="relative min-w-0 flex-1">
						<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							aria-label={m.search_provider_templates()}
							className="pl-9"
							onChange={(event) => setSearch(event.target.value)}
							placeholder={m.search_provider_templates()}
							value={search}
						/>
					</div>
					<Button
						aria-label={
							compact ? m.use_comfortable_view() : m.use_compact_view()
						}
						aria-pressed={compact}
						onClick={() => setCompact((value) => !value)}
						size="icon-sm"
						title={compact ? m.use_comfortable_view() : m.use_compact_view()}
						variant={compact ? "secondary" : "outline"}
					>
						{compact ? <List /> : <Grid2X2 />}
					</Button>
				</div>
				{visible.length === 0 ? (
					<p className="grid min-h-36 place-items-center text-sm text-muted-foreground">
						{m.no_provider_templates_match()}
					</p>
				) : (
					<VirtualTemplateList
						compact={compact}
						lanes={lanes}
						onSelect={onSelect}
						rows={rows}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

function VirtualTemplateList({
	rows,
	compact,
	lanes,
	onSelect,
}: {
	readonly rows: readonly TemplatePickerRow[];
	readonly compact: boolean;
	readonly lanes: number;
	readonly onSelect: (template: Template) => void;
}) {
	const parentRef = useRef<HTMLDivElement>(null);
	const estimateSize = useCallback(
		(index: number) =>
			rows[index]?.kind === "heading" ? 32 : compact ? 72 : 96,
		[compact, rows],
	);
	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => parentRef.current,
		estimateSize,
		gap: 8,
		getItemKey: (index) => rows[index]?.key ?? index,
		overscan: 8,
		useFlushSync: false,
	});
	return (
		<div
			className="min-h-0 max-h-[min(60svh,36rem)] overflow-y-auto pr-1"
			ref={parentRef}
		>
			<div
				className="relative w-full"
				style={{ height: virtualizer.getTotalSize() }}
			>
				{virtualizer.getVirtualItems().map((virtualRow) => {
					const row = rows[virtualRow.index];
					if (!row) return null;
					return (
						<div
							className="absolute top-0 left-0 w-full"
							data-index={virtualRow.index}
							key={row.key}
							ref={virtualizer.measureElement}
							style={{ transform: `translateY(${virtualRow.start}px)` }}
						>
							{row.kind === "heading" ? (
								<div className="flex h-8 items-center gap-2 px-1">
									<h2 className="text-sm font-semibold">{row.title}</h2>
									<span className="text-xs text-muted-foreground">
										{row.count}
									</span>
								</div>
							) : (
								<div
									className="grid gap-2"
									style={{
										gridTemplateColumns: `repeat(${lanes}, minmax(0, 1fr))`,
									}}
								>
									{row.templates.map((template) => (
										<TemplateCard
											compact={compact}
											key={template.slug}
											onSelect={onSelect}
											template={template}
										/>
									))}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function TemplateCard({
	template,
	compact,
	onSelect,
}: {
	readonly template: Template;
	readonly compact: boolean;
	readonly onSelect: (template: Template) => void;
}) {
	return (
		<button
			className={`group flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:border-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40 ${compact ? "min-h-16" : "min-h-20"}`}
			onClick={() => onSelect(template)}
			type="button"
		>
			<span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-primary">
				<ProviderIcon
					className="size-5"
					templateSlug={template.slug}
					protocol={template.protocol}
				/>
			</span>
			<span className="min-w-0 flex-1">
				<span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
					<span className="min-w-0 truncate font-medium">
						{providerName(template)}
					</span>
					{templateBadges(template).map((badge) => (
						<Badge
							className="h-4 px-1.5 text-[10px]"
							key={badge}
							variant="outline"
						>
							{badge}
						</Badge>
					))}
				</span>
				{!compact ? (
					<span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">
						{providerDescription(template)}
					</span>
				) : null}
			</span>
			<ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
		</button>
	);
}

function useTemplateLanes(compact: boolean): number {
	const [lanes, setLanes] = useState(1);
	useEffect(() => {
		const media = window.matchMedia("(min-width: 640px)");
		const update = () => setLanes(media.matches ? (compact ? 4 : 3) : 1);
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, [compact]);
	return lanes;
}

export function ConnectionDialog({
	templates,
	onSaved,
	oauthCallbackUrl,
}: {
	readonly templates: readonly Template[];
	readonly onSaved?: () => void | Promise<void>;
	readonly oauthCallbackUrl?: string;
}) {
	const [pickerOpen, setPickerOpen] = useState(false);
	const [configOpen, setConfigOpen] = useState(false);
	const [template, setTemplate] = useState<Template>();
	const choose = (next: Template) => {
		setTemplate(next);
		setPickerOpen(false);
		setConfigOpen(true);
	};
	return (
		<>
			<Button onClick={() => setPickerOpen(true)}>
				<Plus /> {m.new_connection()}
			</Button>
			<TemplatePicker
				open={pickerOpen}
				onOpenChange={setPickerOpen}
				onSelect={choose}
				templates={templates}
			/>
			<ConnectionConfigDialog
				onOpenChange={(open) => {
					setConfigOpen(open);
					if (!open) setTemplate(undefined);
				}}
				onSaved={onSaved}
				oauthCallbackUrl={oauthCallbackUrl}
				open={configOpen}
				template={template}
			/>
		</>
	);
}

export function ConnectionConfigDialog({
	template,
	connection,
	open,
	onOpenChange,
	onSaved,
	onDelete,
	oauthCallbackUrl,
}: {
	readonly template: Template | undefined;
	readonly connection?: ConnectionView;
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly onSaved?: () => void | Promise<void>;
	readonly onDelete?: () => void;
	readonly oauthCallbackUrl?: string;
}) {
	const queryClient = useQueryClient();
	const createConnection = useServerFn(createConnectionForUser);
	const updateConnection = useServerFn(updateConnectionForUser);
	const editing = Boolean(connection);
	const detailsQuery = useQuery({
		...connectionDetailsQueryOptions(connection?.id ?? ""),
		enabled: open && editing,
	});
	const [form, setForm] = useState<ConnectionForm>({
		name: "",
		providerSlug: "",
		baseUrl: "",
	});
	const [config, setConfig] = useState<ConfigValues>({});
	const [clearSecrets, setClearSecrets] = useState<string[]>([]);
	const [healthInterval, setHealthInterval] = useState("");
	const [error, setError] = useState<string>();
	const [pending, setPending] = useState(false);
	const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
	useEffect(() => {
		if (!open || !template) return;
		setForm({
			name: connection?.name ?? "",
			providerSlug: connection?.providerSlug ?? template.slug,
			baseUrl: connection?.baseUrl ?? template.defaultBaseUrl,
		});
		const values: ConfigValues = {};
		for (const field of template.fields)
			if (field.key !== "base_url")
				values[field.key] = connection
					? formatConfigValue(
							field,
							configInputValue(connection.config[field.key]),
						)
					: displayDefault(field.defaultValue);
		setConfig(values);
		setClearSecrets([]);
		setHealthInterval(
			connection?.healthIntervalMinutes == null
				? ""
				: String(connection.healthIntervalMinutes),
		);
		setError(undefined);
		setFieldErrors({});
	}, [connection, open, template]);
	if (!template) return null;
	const activeTemplate = template;
	const secretKeys = new Set(connection?.secretKeys ?? []);
	const setField = (key: string, value: string) =>
		setConfig((current) => ({ ...current, [key]: value }));
	async function submit() {
		setPending(true);
		setError(undefined);
		setFieldErrors({});
		try {
			const normalized: Record<string, unknown> = {};
			const secrets: Record<string, string> = {};
			for (const field of activeTemplate.fields) {
				if (field.key === "base_url") continue;
				const value = config[field.key] ?? "";
				if (field.secret) {
					if (value.trim()) secrets[field.key] = value;
					continue;
				}
				normalized[field.key] = parseConfigValue(field, value);
			}
			if (editing && connection)
				await updateConnection({
					data: {
						id: connection.id,
						name: form.name,
						providerSlug: form.providerSlug,
						baseUrl: form.baseUrl,
						config: asJsonObject(normalized),
						secrets,
						clearSecrets,
						healthIntervalMinutes: healthInterval
							? Number(healthInterval)
							: null,
					},
				});
			else
				await createConnection({
					data: {
						templateSlug: activeTemplate.slug,
						name: form.name,
						providerSlug: form.providerSlug,
						baseUrl: form.baseUrl,
						config: asJsonObject(normalized),
						secrets,
						healthIntervalMinutes: healthInterval
							? Number(healthInterval)
							: undefined,
					},
				});
			await queryClient.invalidateQueries({
				queryKey: queryKeys.connections.all,
			});
			await queryClient.invalidateQueries({
				queryKey: queryKeys.apiKeys.scopeOptions(),
			});
			onOpenChange(false);
			await onSaved?.();
		} catch (cause) {
			setError(
				cause instanceof ConnectionValidationError
					? cause.message
					: m.action_failed(),
			);
			if (cause instanceof ConnectionValidationError) {
				const match = cause.message.match(/\(([^)]+)\)/);
				if (match?.[1]) setFieldErrors({ [match[1]]: cause.message });
			}
		} finally {
			setPending(false);
		}
	}
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90svh] max-w-6xl overflow-y-auto">
				<DialogHeader>
					<div className="flex items-start gap-3">
						<span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-primary">
							<ProviderIcon
								className="size-5"
								templateSlug={activeTemplate.slug}
								protocol={activeTemplate.protocol}
							/>
						</span>
						<div className="min-w-0">
							<DialogTitle>
								{editing
									? m.edit_connection({ name: providerName(template) })
									: m.configure_connection({ name: providerName(template) })}
							</DialogTitle>
							<DialogDescription>
								{providerDescription(template)}
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>
				{editing && connection ? (
					<div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
						<Stat
							label={m.lifecycle()}
							value={statusLabel(connection.status)}
						/>
						<Stat label={m.health()} value={statusLabel(connection.health)} />
						<Stat
							label={m.encrypted_fields()}
							value={String(connection.secretKeys.length)}
						/>
						<Stat
							label={m.last_updated()}
							value={formatDateTime(connection.updatedAt)}
						/>
						<Stat
							label={m.requests()}
							value={
								detailsQuery.data
									? m.requests_count({
											count: detailsQuery.data.metrics24h.requests,
										})
									: m.loading()
							}
						/>
						<Stat
							label={m.success_rate()}
							value={
								detailsQuery.data
									? `${(detailsQuery.data.metrics24h.successRate * 100).toFixed(1)}%`
									: m.loading()
							}
						/>
						<Stat
							label={m.p95_latency()}
							value={
								detailsQuery.data
									? m.duration_milliseconds({
											value: detailsQuery.data.metrics24h.p95LatencyMs,
										})
									: m.loading()
							}
						/>
					</div>
				) : null}
				{oauthCallbackUrl && activeTemplate.capabilities.connect ? (
					<div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
						<Label htmlFor="oauth-callback-url">{m.oauth_callback_url()}</Label>
						<Input id="oauth-callback-url" readOnly value={oauthCallbackUrl} />
						<p className="text-xs text-muted-foreground">
							{m.oauth_callback_description()}
						</p>
					</div>
				) : null}
				<form
					className="grid gap-5"
					onSubmit={(event) => {
						event.preventDefault();
						void submit();
					}}
				>
					<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
						<TextField
							label={m.connection_name()}
							name="connection-name"
							onChange={(value) =>
								setForm((current) => ({ ...current, name: value }))
							}
							placeholder={m.connection_name_placeholder()}
							required
							value={form.name}
						/>
						<TextField
							label={m.provider_pool_slug()}
							name="provider-slug"
							onChange={(value) =>
								setForm((current) => ({ ...current, providerSlug: value }))
							}
							placeholder={m.provider_pool_placeholder()}
							required
							value={form.providerSlug}
						/>
						<div className="grid gap-2 sm:col-span-2">
							<Label htmlFor="base-url">{m.target_url()}</Label>
							<Input
								id="base-url"
								onChange={(event) =>
									setForm((current) => ({
										...current,
										baseUrl: event.target.value,
									}))
								}
								placeholder={template.defaultBaseUrl}
								required
								type="url"
								value={form.baseUrl}
							/>
						</div>
					</div>
					<div className="grid gap-2 sm:max-w-xs">
						<Label htmlFor="health-interval">{m.health_check_interval()}</Label>
						<Input
							id="health-interval"
							min={5}
							max={1440}
							onChange={(event) => setHealthInterval(event.target.value)}
							placeholder={m.health_check_interval_placeholder()}
							type="number"
							value={healthInterval}
						/>
						<p className="text-xs text-muted-foreground">
							{m.health_check_interval_description()}
						</p>
					</div>
					<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
						{template.fields
							.filter(
								(field) =>
									field.key !== "base_url" &&
									(!field.visibleWhen ||
										config[field.visibleWhen.field] ===
											field.visibleWhen.equals),
							)
							.map((field) => (
								<ProviderField
									field={field}
									key={field.key}
									onClear={() =>
										setClearSecrets((current) =>
											current.includes(field.key)
												? current.filter((item) => item !== field.key)
												: [...current, field.key],
										)
									}
									onChange={(value) => setField(field.key, value)}
									secretStored={
										secretKeys.has(field.key) &&
										!clearSecrets.includes(field.key)
									}
									value={config[field.key] ?? ""}
									error={fieldErrors[field.key]}
								/>
							))}
					</div>
					{error ? (
						<p className="text-sm text-destructive" role="alert">
							{error}
						</p>
					) : null}
					<DialogFooter>
						{editing && onDelete ? (
							<Button onClick={onDelete} type="button" variant="destructive">
								<Trash2 /> {m.delete()}
							</Button>
						) : null}
						<Button
							onClick={() => onOpenChange(false)}
							type="button"
							variant="outline"
						>
							{m.cancel()}
						</Button>
						<Button disabled={pending} type="submit">
							{pending ? <LoaderCircle className="animate-spin" /> : null}
							{editing ? m.save_connection() : m.create_connection()}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function ProviderField({
	field,
	value,
	secretStored,
	onChange,
	onClear,
	error,
}: {
	readonly field: Template["fields"][number];
	readonly value: string;
	readonly secretStored: boolean;
	readonly onChange: (value: string) => void;
	readonly onClear: () => void;
	readonly error?: string;
}) {
	const id = `provider-${field.key}`;
	const full = ["json", "key_value", "multi_select"].includes(field.type);
	if (field.type === "boolean")
		return (
			<div className={`flex items-start gap-3 ${full ? "sm:col-span-2" : ""}`}>
				<input
					checked={value === "true"}
					className="mt-0.5 size-4 accent-primary"
					id={id}
					onChange={(event) => onChange(String(event.target.checked))}
					type="checkbox"
				/>
				<div className="grid gap-1">
					<Label htmlFor={id}>
						{fieldLabel(field)}
						{field.required ? " *" : ""}
					</Label>
					<p className="text-xs text-muted-foreground">
						{fieldDescription(field)}
					</p>
					{error ? <p className="text-xs text-destructive">{error}</p> : null}
				</div>
			</div>
		);
	if (field.type === "single_select")
		return (
			<div className="grid gap-2">
				<Label htmlFor={id}>
					{fieldLabel(field)}
					{field.required ? " *" : ""}
				</Label>
				<Select onValueChange={onChange} value={value || undefined}>
					<SelectTrigger id={id}>
						<SelectValue placeholder={fieldDescription(field)} />
					</SelectTrigger>
					<SelectContent>
						{field.options?.map((option) => (
							<SelectItem key={option} value={option}>
								{fieldOptionLabel(option)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{error ? (
					<p className="text-xs text-destructive">{error}</p>
				) : (
					<p className="text-xs text-muted-foreground">
						{fieldDescription(field)}
					</p>
				)}
			</div>
		);
	if (field.type === "multi_select") {
		let selected: string[] = [];
		try {
			selected = value ? (JSON.parse(value) as string[]) : [];
		} catch {
			selected = value
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean);
		}
		return (
			<div className="grid gap-2 sm:col-span-2">
				<Label>
					{fieldLabel(field)}
					{field.required ? " *" : ""}
				</Label>
				<div className="grid gap-2 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
					{field.options?.map((option) => (
						<label className="flex items-center gap-2 text-sm" key={option}>
							<input
								checked={selected.includes(option)}
								onChange={(event) =>
									onChange(
										JSON.stringify(
											event.target.checked
												? [...new Set([...selected, option])]
												: selected.filter((item) => item !== option),
										),
									)
								}
								type="checkbox"
							/>
							{fieldOptionLabel(option)}
						</label>
					))}
				</div>
				<p className="text-xs text-muted-foreground">
					{fieldDescription(field)}
				</p>
			</div>
		);
	}
	if (field.type === "json" || field.type === "key_value")
		return (
			<div className="grid gap-2 sm:col-span-2">
				<Label htmlFor={id}>
					{fieldLabel(field)}
					{field.required ? " *" : ""}
				</Label>
				<Textarea
					id={id}
					onChange={(event) => onChange(event.target.value)}
					placeholder={
						field.type === "key_value"
							? m.header_value_placeholder()
							: m.json_placeholder()
					}
					required={field.required && !secretStored}
					value={value}
				/>
				<p className="text-xs text-muted-foreground">
					{fieldDescription(field)}
				</p>
				{field.secret && secretStored ? (
					<SecretActions onClear={onClear} />
				) : null}
			</div>
		);
	return (
		<div className="grid gap-2">
			<Label htmlFor={id}>
				{fieldLabel(field)}
				{field.required && !secretStored ? " *" : ""}
			</Label>
			<Input
				id={id}
				onChange={(event) => onChange(event.target.value)}
				placeholder={
					secretStored ? m.stored_secret_placeholder() : fieldDescription(field)
				}
				required={field.required && !secretStored}
				type={
					field.secret
						? "password"
						: field.type === "number"
							? "number"
							: "text"
				}
				value={value}
			/>
			{error ? (
				<p className="text-xs text-destructive">{error}</p>
			) : (
				<p className="text-xs text-muted-foreground">
					{fieldDescription(field)}
				</p>
			)}
			{field.secret && secretStored ? (
				<SecretActions onClear={onClear} />
			) : null}
		</div>
	);
}

function SecretActions({ onClear }: { readonly onClear: () => void }) {
	return (
		<Button
			className="w-fit"
			onClick={onClear}
			size="xs"
			type="button"
			variant="ghost"
		>
			<Trash2 /> {m.clear_stored_value()}
		</Button>
	);
}
function TextField({
	label,
	name,
	value,
	placeholder,
	required,
	onChange,
}: {
	readonly label: string;
	readonly name: string;
	readonly value: string;
	readonly placeholder?: string;
	readonly required?: boolean;
	readonly onChange: (value: string) => void;
}) {
	return (
		<div className="grid gap-2">
			<Label htmlFor={name}>{label}</Label>
			<Input
				id={name}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				required={required}
				value={value}
			/>
		</div>
	);
}
function Stat({
	label,
	value,
}: {
	readonly label: string;
	readonly value: ReactNode;
}) {
	return (
		<div>
			<span className="text-xs text-muted-foreground">{label}</span>
			<p className="font-medium">{value}</p>
		</div>
	);
}
