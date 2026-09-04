import { describe, expect, test } from "bun:test";

import { getProviderDefinition, providerRegistry } from "./registry";

describe("predefined provider registry", () => {
	test("registers the requested provider modes", () => {
		expect(
			providerRegistry.filter((provider) =>
				[
					"elevenlabs",
					"siyuan",
					"ticktick",
					"ticktick_oauth",
					"ticktick_mcp",
					"ticktick_mcp_oauth",
					"steam",
					"hindsight",
					"n8n",
				].includes(provider.slug),
			),
		).toHaveLength(9);
	});

	test("uses the requested icon variants", () => {
		expect(getProviderDefinition("elevenlabs")?.icon).toMatchObject({
			kind: "brand",
			variant: "mono",
		});
		expect(getProviderDefinition("siyuan")?.icon).toMatchObject({
			kind: "brand",
			variant: "default",
		});
	});

	test("describes each provider's upstream authentication", () => {
		expect(getProviderDefinition("elevenlabs")?.auth).toMatchObject({
			kind: "api_key",
			name: "xi-api-key",
		});
		expect(getProviderDefinition("siyuan")?.auth).toMatchObject({
			kind: "api_key",
			name: "Authorization",
			prefix: "Token",
		});
		expect(getProviderDefinition("ticktick")?.auth).toMatchObject({
			kind: "api_key",
			name: "Authorization",
			prefix: "Bearer",
		});
		expect(getProviderDefinition("steam")?.auth).toMatchObject({
			kind: "api_key",
			name: "x-webapi-key",
		});
		expect(getProviderDefinition("hindsight")?.auth).toMatchObject({
			kind: "api_key",
			name: "Authorization",
			prefix: "Bearer",
		});
		expect(getProviderDefinition("n8n")?.auth).toMatchObject({
			kind: "api_key",
			name: "X-N8N-API-KEY",
		});
	});
});
