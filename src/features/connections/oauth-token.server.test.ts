import { afterEach, describe, expect, mock, test } from "bun:test";

import { asGatewayResponse } from "../../server/errors";
import { requestToken } from "./oauth-token.server";

const originalFetch = globalThis.fetch;
const endpoint = "https://oauth2.googleapis.com/token";
const tokenBody = new URLSearchParams({
	client_id: "synthetic-client-id",
	client_secret: "synthetic-client-secret",
	code: "synthetic-code",
	code_verifier: "synthetic-pkce-verifier",
	grant_type: "authorization_code",
	redirect_uri: "https://gateway.test/oauth/callback",
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

async function errorResponse() {
	try {
		await requestToken(endpoint, tokenBody, new Map());
		throw new Error("Expected the token request to fail");
	} catch (error) {
		return asGatewayResponse(error);
	}
}

describe("OAuth token exchange", () => {
	test("sends form data and retains token fields after successful exchange", async () => {
		const token = {
			access_token: "synthetic-access-token",
			refresh_token: "synthetic-refresh-token",
			expires_in: 3_600,
			token_type: "Bearer",
		};
		const fetchMock = mock(async () => Response.json(token));
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		expect(await requestToken(endpoint, tokenBody, new Map())).toEqual(token);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [
			string,
			RequestInit,
		];
		expect(url).toBe(endpoint);
		expect(init.method).toBe("POST");
		expect(new Headers(init.headers).get("content-type")).toBe(
			"application/x-www-form-urlencoded",
		);
		expect(init.body?.toString()).toBe(tokenBody.toString());
	});

	test.each([
		[400, "invalid_grant"],
		[401, "invalid_client"],
		[400, "invalid_request"],
		[400, "invalid_scope"],
		[503, "temporarily_unavailable"],
	])("exposes upstream HTTP %i and standard error %s", async (status, error) => {
		globalThis.fetch = mock(async () =>
			Response.json(
				{
					error,
					error_description:
						"Sensitive provider detail synthetic-client-secret",
					access_token: "synthetic-access-token",
				},
				{ status },
			),
		) as unknown as typeof fetch;

		const response = await errorResponse();
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({
			code: "OAUTH_TOKEN_REQUEST_FAILED",
			params: {
				stage: "token_response",
				upstreamStatus: status,
				providerError: error,
			},
		});
	});

	test("distinguishes transport failure without exposing request details", async () => {
		globalThis.fetch = mock(async () => {
			throw new TypeError("Failed request containing synthetic-client-secret");
		}) as unknown as typeof fetch;

		const response = await errorResponse();
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({
			code: "OAUTH_TOKEN_REQUEST_FAILED",
			params: { stage: "transport" },
		});
	});

	test.each([
		{ error: "synthetic-client-secret" },
		{ error: { secret: "synthetic-client-secret" } },
		["invalid_grant"],
		null,
	])("omits unrecognized provider error payloads: %j", async (payload) => {
		globalThis.fetch = mock(async () =>
			Response.json(payload, { status: 400 }),
		) as unknown as typeof fetch;

		expect(await (await errorResponse()).json()).toEqual({
			code: "OAUTH_TOKEN_REQUEST_FAILED",
			params: { stage: "token_response", upstreamStatus: 400 },
		});
	});

	test("handles an upstream HTML error without converting it into a transport error", async () => {
		globalThis.fetch = mock(
			async () => new Response("<h1>Upstream error</h1>", { status: 502 }),
		) as unknown as typeof fetch;

		expect(await (await errorResponse()).json()).toEqual({
			code: "OAUTH_TOKEN_REQUEST_FAILED",
			params: { stage: "token_response", upstreamStatus: 502 },
		});
	});

	test("keeps rejecting successful responses with no access token", async () => {
		globalThis.fetch = mock(async () =>
			Response.json({ token_type: "Bearer" }),
		) as unknown as typeof fetch;

		expect(await (await errorResponse()).json()).toEqual({
			code: "OAUTH_TOKEN_INVALID",
			params: {},
		});
	});

	test("preserves custom header validation errors before making a request", async () => {
		const fetchMock = mock(async () => Response.json({}));
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await expect(
			requestToken(
				endpoint,
				tokenBody,
				new Map([["custom_headers", "invalid-json"]]),
			),
		).rejects.toMatchObject({ code: "INVALID_INJECTED_HEADER", status: 400 });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
