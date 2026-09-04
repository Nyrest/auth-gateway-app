import { describe, expect, test } from "bun:test";

import { validateUpstreamUrl } from "#/server/upstream-url.server";
import { validateConnectionOutboundUrls } from "./connections.server";
import { genericBasic, genericOauth2, genericOidc } from "./providers/generic";

const publicUrlValidator = async (value: string): Promise<URL> =>
	validateUpstreamUrl(value, false);

describe("connection outbound URL validation", () => {
	test("checks configured OAuth, OIDC, and test URLs", async () => {
		await expect(
			validateConnectionOutboundUrls(
				genericOauth2,
				"https://api.example.com",
				{
					authorization_url: "http://127.0.0.1/authorize",
					token_url: "https://oauth.example.com/token",
				},
				publicUrlValidator,
			),
		).rejects.toThrow("Private and local upstreams");

		await expect(
			validateConnectionOutboundUrls(
				genericOidc,
				"https://api.example.com",
				{ issuer: "http://127.0.0.1" },
				publicUrlValidator,
			),
		).rejects.toThrow("Private and local upstreams");

		await expect(
			validateConnectionOutboundUrls(
				genericBasic,
				"https://api.example.com",
				{ test_url: "http://127.0.0.1/health" },
				publicUrlValidator,
			),
		).rejects.toThrow("Private and local upstreams");
	});

	test("resolves a relative test URL against the connection base before checking it", async () => {
		const checked: string[] = [];
		const validator = async (value: string): Promise<URL> => {
			checked.push(value);
			return validateUpstreamUrl(value, false);
		};

		const baseUrl = await validateConnectionOutboundUrls(
			genericBasic,
			"https://api.example.com/v1",
			{ test_url: "health" },
			validator,
		);

		expect(baseUrl.toString()).toBe("https://api.example.com/v1");
		expect(checked).toEqual([
			"https://api.example.com/v1",
			"https://api.example.com/health",
		]);
	});
});
