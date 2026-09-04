import { describe, expect, mock, test } from "bun:test";

let session: { readonly user: { readonly id: string } } | null = null;
const proxyCalls: unknown[][] = [];

mock.module("./auth.server", () => ({
	getSession: async () => session,
}));
mock.module("./proxy.server", () => ({
	proxyPlaygroundRequest: async (...args: unknown[]) => {
		proxyCalls.push(args);
		return new Response("proxied", { status: 201 });
	},
}));

const { handlePlaygroundRequest } = await import("./playground-route.server");

const connectionId = "00000000-0000-0000-0000-000000000000";

function playgroundRequest(headers?: HeadersInit): Request {
	return new Request(`https://gateway.test/api/playground/${connectionId}/v1`, {
		headers,
		method: "POST",
	});
}

describe("Playground route", () => {
	test("requires the internal browser marker before checking authentication", async () => {
		session = null;
		await expect(
			handlePlaygroundRequest(playgroundRequest(), connectionId, "v1"),
		).rejects.toMatchObject({
			code: "PLAYGROUND_REQUEST_REQUIRED",
			status: 403,
		});
	});

	test("rejects malformed connection ids and unauthenticated requests", async () => {
		await expect(
			handlePlaygroundRequest(
				playgroundRequest({ "x-auth-gateway-playground": "1" }),
				"not-a-uuid",
				"v1",
			),
		).rejects.toMatchObject({ code: "INVALID_CONNECTION_ID", status: 400 });

		session = null;
		await expect(
			handlePlaygroundRequest(
				playgroundRequest({ "x-auth-gateway-playground": "1" }),
				connectionId,
				"v1",
			),
		).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
	});

	test("passes the authenticated user and exact connection to the proxy", async () => {
		session = { user: { id: "user-id" } };
		proxyCalls.length = 0;
		const request = playgroundRequest({ "x-auth-gateway-playground": "1" });
		const response = await handlePlaygroundRequest(
			request,
			connectionId,
			"v1/test",
		);
		expect(response.status).toBe(201);
		expect(proxyCalls).toEqual([[request, "user-id", connectionId, "v1/test"]]);
	});
});
