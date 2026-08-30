import { useRouter } from "@tanstack/react-router";
import { LoaderCircle, Plus } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";

import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
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
	createConnectionForUser,
	type listProviderTemplates,
} from "./connections.functions";

type Template = Awaited<ReturnType<typeof listProviderTemplates>>[number];

function fieldDefault(
	value: Template["fields"][number]["defaultValue"],
): string {
	return typeof value === "string" ? value : "";
}

export function ConnectionDialog({
	templates,
}: {
	readonly templates: readonly Template[];
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [templateSlug, setTemplateSlug] = useState(
		templates[0]?.slug ?? "generic_bearer",
	);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const template = useMemo(
		() => templates.find((item) => item.slug === templateSlug) ?? templates[0],
		[templateSlug, templates],
	);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!template) {
			return;
		}
		const form = new FormData(event.currentTarget);
		const config: Record<string, string | boolean> = {};
		const secrets: Record<string, string> = {};
		for (const field of template.fields) {
			if (field.key === "base_url") {
				continue;
			}
			if (field.type === "boolean") {
				config[field.key] = form.get(field.key) === "on";
			} else {
				const value = String(form.get(field.key) ?? "");
				if (field.secret) {
					secrets[field.key] = value;
				} else {
					config[field.key] = value;
				}
			}
		}
		setSubmitting(true);
		setError(null);
		try {
			await createConnectionForUser({
				data: {
					allowPrivateNetwork: form.get("allowPrivateNetwork") === "on",
					baseUrl: String(form.get("baseUrl") ?? ""),
					config,
					name: String(form.get("name") ?? ""),
					providerSlug: String(form.get("providerSlug") ?? ""),
					secrets,
					templateSlug: template.slug,
				},
			});
			setOpen(false);
			await router.invalidate();
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "The connection could not be created.",
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button>
					<Plus /> New connection
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-[88svh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Add a connection</DialogTitle>
					<DialogDescription>
						Credentials are encrypted before storage. Connections remain
						unavailable to the proxy until you verify them.
					</DialogDescription>
				</DialogHeader>
				<form className="grid gap-4" onSubmit={(event) => void submit(event)}>
					<div className="grid gap-2">
						<Label htmlFor="template">Provider template</Label>
						<Select value={templateSlug} onValueChange={setTemplateSlug}>
							<SelectTrigger id="template">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{templates.map((item) => (
									<SelectItem key={item.slug} value={item.slug}>
										{item.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							{template?.description}
						</p>
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<Field
							label="Connection name"
							name="name"
							placeholder="Production account"
							required
						/>
						<Field
							label="Provider pool slug"
							name="providerSlug"
							placeholder="openai"
							required
						/>
					</div>
					<Field
						label="Target URL"
						name="baseUrl"
						defaultValue={template?.defaultBaseUrl}
						placeholder="https://api.example.com"
						required
					/>
					{template?.fields
						.filter((field) => field.key !== "base_url")
						.map((field) => (
							<div className="grid gap-2" key={field.key}>
								<Label htmlFor={field.key}>{field.label}</Label>
								{field.type === "single_select" ? (
									<select
										className="h-9 rounded-md border bg-background px-3 text-sm"
										defaultValue={fieldDefault(field.defaultValue)}
										id={field.key}
										name={field.key}
									>
										{field.options?.map((option) => (
											<option key={option} value={option}>
												{option}
											</option>
										))}
									</select>
								) : field.type === "boolean" ? (
									<label className="flex items-center gap-2 text-sm">
										<input
											defaultChecked={field.defaultValue === true}
											id={field.key}
											name={field.key}
											type="checkbox"
										/>{" "}
										Enable
									</label>
								) : (
									<Input
										defaultValue={fieldDefault(field.defaultValue)}
										id={field.key}
										name={field.key}
										placeholder={
											field.type === "key_value"
												? '[{"key":"x-api-key","value":"…"}]'
												: undefined
										}
										required={field.required}
										type={field.secret ? "password" : "text"}
									/>
								)}
								<p className="text-xs text-muted-foreground">
									{field.description}
								</p>
							</div>
						))}
					<label className="flex items-start gap-2 text-sm">
						<input name="allowPrivateNetwork" type="checkbox" />
						<span>Allow a private or local upstream for this connection.</span>
					</label>
					{error ? (
						<p className="text-sm text-destructive" role="alert">
							{error}
						</p>
					) : null}
					<Button disabled={submitting} type="submit">
						{submitting ? <LoaderCircle className="animate-spin" /> : null}{" "}
						Create connection
					</Button>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function Field({
	defaultValue,
	label,
	name,
	placeholder,
	required,
}: {
	readonly defaultValue?: string;
	readonly label: string;
	readonly name: string;
	readonly placeholder?: string;
	readonly required?: boolean;
}) {
	return (
		<div className="grid gap-2">
			<Label htmlFor={name}>{label}</Label>
			<Input
				defaultValue={defaultValue}
				id={name}
				name={name}
				placeholder={placeholder}
				required={required}
			/>
		</div>
	);
}
