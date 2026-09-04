import Notion from "@thesvg/react/notion";

import { mcpBaseFields } from "./common";
import { createApiKeyProvider, createMcpProvider } from "./factories";
import type { ProviderDefinition } from "./types";

const notionIcon = { kind: "brand", component: Notion } as const;

export const notion: ProviderDefinition = createApiKeyProvider({
	slug: "notion",
	nameKey: "providers_notion_name",
	descriptionKey: "providers_notion_description",
	baseUrl: "https://api.notion.com",
	testPath: "/v1/users/me",
	icon: notionIcon,
	keyName: "Authorization",
	fixedHeaders: { "Notion-Version": "2022-06-28" },
});

export const notionMcp: ProviderDefinition = createMcpProvider({
	slug: "notion_mcp",
	nameKey: "providers_notion_mcp_name",
	descriptionKey: "providers_notion_mcp_description",
	baseUrl: "https://mcp.notion.com",
	auth: { kind: "bearer", tokenField: "token" },
	icon: notionIcon,
	fields: [
		...mcpBaseFields,
		{
			key: "token",
			labelKey: "provider_field_token",
			descriptionKey: "provider_field_token_description",
			type: "string",
			required: true,
			secret: true,
		},
	],
});

export const notionProviders: readonly ProviderDefinition[] = [
	notion,
	notionMcp,
];
