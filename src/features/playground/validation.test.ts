import { describe, expect, test } from "bun:test";

import {
	headersToText,
	normalizePlaygroundPath,
	parseHeaders,
	validateHeaders,
} from "./validation";

describe("Playground request validation", () => {
	test("round-trips valid headers through JSON", () => {
		const headers = [
			{ id: "first", key: "Content-Type", value: "application/json" },
			{ id: "second", key: "X-Trace", value: "request: 1" },
		];
		const parsed = parseHeaders(headersToText(headers));
		expect("value" in parsed && parsed.value).toEqual(
			headers.map(({ key, value }) => expect.objectContaining({ key, value })),
		);
	});

	test("rejects unsafe, duplicate, and non-string JSON headers", () => {
		expect(parseHeaders('{"X-Trace":"first","x-trace":"second"}')).toEqual({
			error: "invalid_headers",
		});
		expect(parseHeaders('{"X-Trace":"a \\"key\\": value"}')).toMatchObject({
			value: [{ key: "X-Trace", value: 'a "key": value' }],
		});
		expect(parseHeaders('{"accept":true}')).toEqual({
			error: "invalid_headers",
		});
		expect(
			validateHeaders([{ key: "Authorization", value: "Bearer x" }]),
		).toEqual({
			error: "invalid_headers",
		});
	});

	test("accepts only safe relative paths", () => {
		expect(normalizePlaygroundPath("/v1/messages?limit=1")).toEqual({
			value: "/v1/messages?limit=1",
		});
		for (const path of [
			"https://example.com",
			"//example.com",
			"/v1/%2e%2e/secrets",
			"/v1/%252e%252e/secrets",
			"/v1/%",
			"/v1/items#fragment",
		]) {
			expect(normalizePlaygroundPath(path)).toEqual({ error: "invalid_path" });
		}
	});
});
