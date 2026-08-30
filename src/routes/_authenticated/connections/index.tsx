import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
	CheckCircle2,
	Link2,
	LoaderCircle,
	ShieldCheck,
	Trash2,
} from "lucide-react";
import { useState } from "react";

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
import { ConnectionDialog } from "#/features/connections/connection-dialog";
import {
	beginOAuthForUser,
	connectClientCredentialsForUser,
	deleteConnectionForUser,
	verifyConnectionForUser,
} from "#/features/connections/connections.functions";
import type { ConnectionView } from "#/features/connections/connections.server";
import {
	connectionsQueryOptions,
	providerTemplatesQueryOptions,
} from "#/lib/api";
import { getQueryClient } from "#/lib/query-client";

export const Route = createFileRoute("/_authenticated/connections/")({
	loader: async () => ({
		connections: await getQueryClient().ensureQueryData(
			connectionsQueryOptions(),
		),
		templates: await getQueryClient().ensureQueryData(
			providerTemplatesQueryOptions(),
		),
	}),
	component: ConnectionsPage,
});

function ConnectionsPage() {
	const { connections, templates } = Route.useLoaderData();
	return (
		<>
			<PageHeader
				actions={<ConnectionDialog templates={templates} />}
				description="Managed upstream credentials are encrypted individually and can be pooled behind one provider slug."
				title="Connections"
			/>
			{connections.length === 0 ? (
				<Card className="border-dashed">
					<CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
						<ShieldCheck className="mb-4 size-8 text-muted-foreground" />
						<h2 className="font-semibold">No connections yet</h2>
						<p className="mt-2 max-w-md text-sm text-muted-foreground">
							Add an upstream account to start proxying requests through a
							policy-controlled provider pool.
						</p>
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-4 lg:grid-cols-2">
					{connections.map((connection) => (
						<ConnectionCard connection={connection} key={connection.id} />
					))}
				</div>
			)}
		</>
	);
}

function ConnectionCard({
	connection,
}: {
	readonly connection: ConnectionView;
}) {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	async function run(
		action: "verify" | "connect" | "clientCredentials" | "delete",
	) {
		setBusy(true);
		setMessage(null);
		try {
			if (action === "verify") {
				const result = await verifyConnectionForUser({
					data: { id: connection.id },
				});
				setMessage(
					result.ok
						? `Verified (${result.statusCode})`
						: `Verification failed (${result.statusCode})`,
				);
			} else if (action === "connect") {
				const result = await beginOAuthForUser({ data: { id: connection.id } });
				window.location.assign(result.authorizationUrl);
				return;
			} else if (action === "clientCredentials") {
				await connectClientCredentialsForUser({ data: { id: connection.id } });
				setMessage("Access token acquired. Verify the connection next.");
			} else if (
				window.confirm(
					`Delete ${connection.name}? This also removes its encrypted credentials.`,
				)
			) {
				await deleteConnectionForUser({ data: { id: connection.id } });
			}
			await router.invalidate();
		} catch (cause) {
			setMessage(cause instanceof Error ? cause.message : "The action failed.");
		} finally {
			setBusy(false);
		}
	}
	const canOAuth = [
		"generic_oauth2",
		"generic_oidc",
		"google_oauth",
		"microsoft_entra_oauth",
		"github_oauth",
	].includes(connection.templateSlug);
	const clientCredentials =
		connection.templateSlug === "generic_oauth2" &&
		connection.config.grant_type === "client_credentials";
	return (
		<Card>
			<CardHeader>
				<div className="flex items-start justify-between gap-3">
					<div>
						<CardTitle>{connection.name}</CardTitle>
						<CardDescription className="mt-1 font-mono text-xs">
							{connection.providerSlug}
						</CardDescription>
					</div>
					<Badge
						variant={
							connection.status === "active" && connection.health === "healthy"
								? "default"
								: "secondary"
						}
					>
						{connection.status} · {connection.health}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="grid gap-4 text-sm text-muted-foreground">
				<p className="font-mono text-xs">{connection.baseUrl}</p>
				<p>
					{connection.secretKeys.length} encrypted credential field
					{connection.secretKeys.length === 1 ? "" : "s"}
				</p>
				<div className="flex flex-wrap gap-2">
					<Button
						disabled={busy}
						onClick={() => void run("verify")}
						size="sm"
						type="button"
					>
						<CheckCircle2 /> Verify
					</Button>
					{canOAuth ? (
						<Button
							disabled={busy}
							onClick={() =>
								void run(clientCredentials ? "clientCredentials" : "connect")
							}
							size="sm"
							type="button"
							variant="outline"
						>
							<Link2 /> {clientCredentials ? "Get token" : "Connect OAuth"}
						</Button>
					) : null}
					<Button
						disabled={busy}
						onClick={() => void run("delete")}
						size="sm"
						type="button"
						variant="ghost"
					>
						<Trash2 /> Delete
					</Button>
				</div>
				{busy ? (
					<p className="flex items-center gap-2">
						<LoaderCircle className="size-3 animate-spin" /> Working…
					</p>
				) : null}
				{message ? <p className="text-xs">{message}</p> : null}
			</CardContent>
		</Card>
	);
}
