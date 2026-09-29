import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, PlugZap } from "lucide-react";

import { PageHeader } from "#/components/layout/app-shell";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authenticated/")({
	component: OverviewPage,
});

function OverviewPage() {
	const cards = [
		{
			description: m.overview_connections_description(),
			icon: PlugZap,
			title: m.connections(),
		},
		{
			description: m.overview_api_keys_description(),
			icon: KeyRound,
			title: m.api_keys(),
		},
	] as const;
	return (
		<>
			<PageHeader description={m.overview_description()} title={m.overview()} />
			<div className="grid gap-4 md:grid-cols-2">
				{cards.map(({ description, icon: Icon, title }) => (
					<Card key={title} className="shadow-sm">
						<CardHeader>
							<Icon className="size-5 text-muted-foreground" />
							<CardTitle className="pt-3 text-base">{title}</CardTitle>
						</CardHeader>
						<CardContent>
							<CardDescription>{description}</CardDescription>
						</CardContent>
					</Card>
				))}
			</div>
		</>
	);
}
