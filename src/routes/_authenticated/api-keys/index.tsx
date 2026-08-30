import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Copy, KeyRound, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";

import { PageHeader } from "#/components/layout/app-shell";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent } from "#/components/ui/card";
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
	createApiKeyForUser,
	revokeApiKeyForUser,
} from "#/features/api-keys/api-keys.functions";
import type { ApiKeyView } from "#/features/api-keys/api-keys.server";
import { apiKeysQueryOptions } from "#/lib/api";
import { getQueryClient } from "#/lib/query-client";

export const Route = createFileRoute("/_authenticated/api-keys/")({
	loader: () => getQueryClient().ensureQueryData(apiKeysQueryOptions()),
	component: ApiKeysPage,
});

function ApiKeysPage() {
	const keys = Route.useLoaderData();
	return (
		<>
			<PageHeader
				actions={<ApiKeyDialog />}
				description="Create proxy-only credentials, scope them to provider pools, and revoke them without exposing plaintext secrets again."
				title="API Keys"
			/>
			{keys.length === 0 ? (
				<Card className="border-dashed">
					<CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
						<KeyRound className="mb-4 size-8 text-muted-foreground" />
						<h2 className="font-semibold">No API keys yet</h2>
						<p className="mt-2 max-w-md text-sm text-muted-foreground">
							Create a proxy-only key after you have verified a connection.
						</p>
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-3">
					{keys.map((key) => (
						<ApiKeyCard apiKey={key} key={key.id} />
					))}
				</div>
			)}
		</>
	);
}

function ApiKeyDialog() {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [secret, setSecret] = useState<string | null>(null);
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		setBusy(true);
		setError(null);
		try {
			const expiresAt = String(form.get("expiresAt") ?? "");
			const result = await createApiKeyForUser({
				data: {
					label: String(form.get("label") ?? ""),
					providerSlugs: String(form.get("providerSlugs") ?? "")
						.split(",")
						.map((item) => item.trim())
						.filter(Boolean),
					instanceIds: [],
					...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
				},
			});
			setSecret(result.secret);
			setOpen(false);
			await router.invalidate();
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "The API key could not be created.",
			);
		} finally {
			setBusy(false);
		}
	}
	return (
		<>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogTrigger asChild>
					<Button>
						<Plus /> New API key
					</Button>
				</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Create proxy API key</DialogTitle>
						<DialogDescription>
							Leave pools empty to allow every pool in your workspace.
						</DialogDescription>
					</DialogHeader>
					<form className="grid gap-4" onSubmit={(event) => void submit(event)}>
						<div className="grid gap-2">
							<Label htmlFor="label">Label</Label>
							<Input
								id="label"
								name="label"
								placeholder="Local automation"
								required
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="providerSlugs">Allowed provider pools</Label>
							<Input
								id="providerSlugs"
								name="providerSlugs"
								placeholder="openai, github (optional)"
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="expiresAt">Expiry</Label>
							<Input id="expiresAt" name="expiresAt" type="datetime-local" />
						</div>
						{error ? (
							<p className="text-sm text-destructive" role="alert">
								{error}
							</p>
						) : null}
						<Button disabled={busy} type="submit">
							{busy ? <LoaderCircle className="animate-spin" /> : null} Create
							key
						</Button>
					</form>
				</DialogContent>
			</Dialog>
			{secret ? (
				<Dialog open onOpenChange={(next) => !next && setSecret(null)}>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Copy this key now</DialogTitle>
							<DialogDescription>
								It cannot be displayed again after you close this dialog.
							</DialogDescription>
						</DialogHeader>
						<code className="break-all rounded-md border bg-muted p-3 text-xs">
							{secret}
						</code>
						<Button
							onClick={() => void navigator.clipboard.writeText(secret)}
							type="button"
						>
							<Copy /> Copy key
						</Button>
					</DialogContent>
				</Dialog>
			) : null}
		</>
	);
}

function ApiKeyCard({ apiKey }: { readonly apiKey: ApiKeyView }) {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	async function revoke() {
		if (!window.confirm(`Revoke ${apiKey.label}?`)) return;
		setBusy(true);
		try {
			await revokeApiKeyForUser({ data: { id: apiKey.id } });
			await router.invalidate();
		} finally {
			setBusy(false);
		}
	}
	return (
		<Card>
			<CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
				<div>
					<p className="font-medium">{apiKey.label}</p>
					<p className="mt-1 font-mono text-xs text-muted-foreground">
						{apiKey.prefix}_••••••••
					</p>
					<p className="mt-2 text-xs text-muted-foreground">
						{apiKey.providerSlugs.length
							? apiKey.providerSlugs.join(", ")
							: "All provider pools"}
						{apiKey.expiresAt
							? ` · expires ${new Date(apiKey.expiresAt).toLocaleDateString()}`
							: ""}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Badge variant={apiKey.revokedAt ? "secondary" : "default"}>
						{apiKey.revokedAt ? "revoked" : "active"}
					</Badge>
					{!apiKey.revokedAt ? (
						<Button
							disabled={busy}
							onClick={() => void revoke()}
							size="sm"
							type="button"
							variant="ghost"
						>
							<Trash2 /> Revoke
						</Button>
					) : null}
				</div>
			</CardContent>
		</Card>
	);
}
