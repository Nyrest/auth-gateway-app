import { describe, expect, test } from "bun:test";

import { readJsonResponse } from "./outbound-request.server";

describe("bounded upstream JSON responses", () => {
	test("parses a small JSON response", async () => {
		await expect(
			readJsonResponse(
				new Response(
					JSON.stringify({ authorization_servers: ["https://id.example"] }),
				),
			),
		).resolves.toEqual({ authorization_servers: ["https://id.example"] });
	});

	test("rejects an oversized JSON response before parsing it", async () => {
		await expect(
			readJsonResponse(
				new Response("x".repeat(256 * 1024 + 1), {
					headers: { "content-length": String(256 * 1024 + 1) },
				}),
			),
		).rejects.toMatchObject({ code: "UPSTREAM_RESPONSE_TOO_LARGE" });
	});

	test("cancels a JSON response that stalls after headers", async () => {
		const stalled = new ReadableStream<Uint8Array>({
			start() {},
		});
		await expect(
			readJsonResponse(new Response(stalled), 1),
		).rejects.toMatchObject({ code: "UPSTREAM_RESPONSE_TIMEOUT" });
	});
});
