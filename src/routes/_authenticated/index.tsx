import { createFileRoute } from "@tanstack/react-router";
import { Activity, KeyRound, PlugZap } from "lucide-react";

import { PageHeader } from "#/components/layout/app-shell";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";

const cards = [
	{
		description:
			"Configure secure upstream accounts and share pools deliberately.",
		icon: PlugZap,
		title: "Connections",
	},
	{
		description:
			"Issue and revoke proxy-only credentials without persisting plaintext keys.",
		icon: KeyRound,
		title: "API Keys",
	},
	{
		description:
			"Review gateway mutations and recent proxy activity without exposing sensitive payloads.",
		icon: Activity,
		title: "Activity",
	},
] as const;

export const Route = createFileRoute("/_authenticated/")({
	component: OverviewPage,
});

function OverviewPage() {
	return (
		<>
			<PageHeader
				description="A security-focused control plane for managed upstream credentials and streaming API access."
				title="Overview"
			/>
			<div className="grid gap-4 md:grid-cols-3">
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
