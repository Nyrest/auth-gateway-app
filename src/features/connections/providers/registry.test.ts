import { describe, expect, test } from "bun:test";

import { getProviderDefinition, providerRegistry } from "./registry";

describe("provider registry custom headers", () => {
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

	test("injects one optional encrypted custom_headers field into every provider", () => {
		expect(providerRegistry.length).toBeGreaterThan(0);
		for (const provider of providerRegistry) {
			const fields = provider.fields.filter(
				(field) => field.key === "custom_headers",
			);
			expect(fields).toHaveLength(1);
			expect(fields[0]).toMatchObject({
				type: "key_value",
				required: false,
				secret: true,
			});
		}
	});

	test("exposes Generic HTTP without a custom auth strategy", () => {
		const genericHeaders = getProviderDefinition("generic_headers");
		expect(genericHeaders).toBeDefined();
		expect(genericHeaders?.metadata.nameKey).toBe(
			"providers_generic_headers_name",
		);
		expect(genericHeaders?.auth?.kind).not.toBe("custom_headers");
		expect(getProviderDefinition("generic_mcp_headers")).toBeUndefined();
	});
});
