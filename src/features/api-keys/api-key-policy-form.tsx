import { CalendarClock, Check } from "lucide-react";
import { type FormEvent, useState } from "react";

import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { m } from "#/paraglide/messages.js";

type ProviderSelectionFilter = "all" | "selected" | "unselected";

export type KeyForm = {
	label: string;
	providerScopeMode: "all" | "selected";
	providerSlugs: string[];
	instanceIds: string[];
	expiresAt: string;
};

export type ApiKeyScope = {
	providers: readonly string[];
	instances: readonly {
		id: string;
		providerSlug: string;
		name: string;
	}[];
};

function toggleValue(values: string[], value: string): string[] {
	return values.includes(value)
		? values.filter((item) => item !== value)
		: [...values, value];
}

export function ApiKeyPolicyForm({
	form,
	scope,
	pending,
	error,
	onChange,
	onSubmit,
	onCancel,
}: {
	form: KeyForm;
	scope: ApiKeyScope | undefined;
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
