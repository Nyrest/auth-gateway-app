import { createFileRoute } from "@tanstack/react-router";

import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";

export const Route = createFileRoute("/_authenticated/docs")({
	component: DocsPage,
});

function DocsPage() {
	return (
		<main className="mx-auto w-full max-w-4xl px-6 py-14">
			<h1 className="text-3xl font-semibold tracking-tight">
				Proxy API reference
			</h1>
			<p className="mt-3 text-muted-foreground">
				Use a proxy API key with a configured provider pool. Management stays in
				the dashboard.
			</p>
			<Card className="mt-8">
				<CardHeader>
					<CardTitle>Streaming endpoint</CardTitle>
				</CardHeader>
				<CardContent>
					<code className="block rounded-md bg-muted px-4 py-3 text-sm">
						/endpoint/&#123;providerSlug&#125;/&#123;path&#125;
					</code>
					<p className="mt-4 text-sm text-muted-foreground">
						Send the generated API key as a Bearer token. The gateway forwards
						eligible requests and preserves upstream response streaming.
					</p>
				</CardContent>
			</Card>
		</main>
	);
}
