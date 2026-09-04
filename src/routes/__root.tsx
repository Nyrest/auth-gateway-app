import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
} from "@tanstack/react-router";
import { m } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";
import { themeInitScript } from "../components/theme-toggle";
import { getQueryClient } from "../lib/query-client";
import appCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: m.app_name(),
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang={getLocale()} suppressHydrationWarning>
			<head>
				<HeadContent />
				<script>{themeInitScript}</script>
			</head>
			<body>
				<QueryClientProvider client={getQueryClient()}>
					{children}
				</QueryClientProvider>
				<Scripts />
			</body>
		</html>
	);
}
