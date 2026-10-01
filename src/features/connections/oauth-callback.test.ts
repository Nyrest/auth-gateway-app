import { beforeEach, describe, expect, mock, test } from "bun:test";

import { GatewayError } from "../../server/errors";
import { googleProviders } from "./providers/google";

const callbacks: unknown[] = [];
let callbackError: GatewayError | undefined;

mock.module("./oauth.server", () => ({
	finishOAuthConnection: async (callback: unknown) => {
		callbacks.push(callback);
		if (callbackError) throw callbackError;
		return { success: true, message: "Connected" };
	},
}));

const { Route } = await import("../../routes/oauth/callback");
const handleCallback = Route.options.server.handlers.GET;
const state = "synthetic-oauth-state-for-regression";

function requestCallback(query: Record<string, string>) {
	const request = new Request(
		`https://gateway.test/oauth/callback?${new URLSearchParams(query)}`,
	);
	return handleCallback({ request });
}

beforeEach(() => {
	callbacks.length = 0;
	callbackError = undefined;
});

describe("OAuth callback route", () => {
	test.each(
		googleProviders
			.filter((provider) => provider.capabilities.connect)
			.map((provider) => [provider.slug, provider] as const),
	)("accepts callback metadata for %s", async (slug, provider) => {
		expect(provider.oauthEndpoints).toEqual({
			authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
			tokenUrl: "https://oauth2.googleapis.com/token",
		});
		const code = `synthetic-code-for-${slug}`;
		const response = await requestCallback({
			state,
			code,
			iss: "https://accounts.google.com",
			scope: provider.defaultScopes ?? "",
		});

		expect(response.status).toBe(303);
		expect(callbacks).toEqual([{ state, code }]);
	});

	test("accepts Google callback metadata and redirects after token exchange", async () => {
		const response = await requestCallback({
			state,
			code: "synthetic-authorization-code",
			iss: "https://accounts.google.com",
			scope: "https://www.googleapis.com/auth/drive.readonly",
			authuser: "0",
			prompt: "consent",
		});

		expect(response.status).toBe(303);
		expect(response.headers.get("location")).toBe(
			"https://gateway.test/connections?oauth=connected",
		);
		expect(callbacks).toEqual([
			{ state, code: "synthetic-authorization-code" },
		]);
	});

	test("preserves provider denial with extra error metadata", async () => {
		callbackError = new GatewayError(400, "OAUTH_DENIED", "Denied");
		const response = await requestCallback({
			state,
			error: "access_denied",
			error_description: "The user denied access.",
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ code: "OAUTH_DENIED", params: {} });
		expect(callbacks).toEqual([{ state, error: "access_denied" }]);
	});

	test("still rejects expired or consumed state after parsing Google metadata", async () => {
		callbackError = new GatewayError(
			400,
			"OAUTH_STATE_INVALID",
			"Invalid state",
		);
		const response = await requestCallback({
			state,
			code: "synthetic-authorization-code",
			iss: "https://accounts.google.com",
			scope: "https://www.googleapis.com/auth/drive.readonly",
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			code: "OAUTH_STATE_INVALID",
			params: {},
		});
	});

	test.each([
		["missing state", { code: "synthetic-authorization-code" }],
		[
			"short state",
			{ state: "too-short", code: "synthetic-authorization-code" },
		],
		[
			"long state",
			{ state: "x".repeat(513), code: "synthetic-authorization-code" },
		],
		["empty code", { state, code: "" }],
		["long code", { state, code: "x".repeat(4_097) }],
		["long error", { state, error: "x".repeat(257) }],
	])("returns 400 before consuming state: %s", async (_label, query) => {
		const response = await requestCallback(query);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			code: "OAUTH_CALLBACK_INVALID",
			params: {},
		});
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(callbacks).toEqual([]);
	});
});
