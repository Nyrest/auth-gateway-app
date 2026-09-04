import Slack from "@thesvg/react/slack";

import { createApiKeyProvider } from "./factories";
import type { ProviderDefinition } from "./types";

export const slack: ProviderDefinition = createApiKeyProvider({
	slug: "slack",
	nameKey: "providers_slack_name",
	descriptionKey: "providers_slack_description",
	baseUrl: "https://slack.com/api",
	testPath: "/auth.test",
	icon: { kind: "brand", component: Slack },
});

export const slackProviders: readonly ProviderDefinition[] = [slack];
