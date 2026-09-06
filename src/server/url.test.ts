import { describe, expect, test } from "bun:test";

import { appendUpstreamPath, parseHttpUrl } from "./url.server";

describe("upstream URL handling", () => {
	test("accepts private HTTP URLs and URL components supplied by the user", () => {
		const url = parseHttpUrl("http://user:pass@10.0.0.1:8080/api#fragment");

		expect(url.hostname).toBe("10.0.0.1");
		expect(url.protocol).toBe("http:");
		expect(url.username).toBe("user");
		expect(url.hash).toBe("#fragment");
	});

	test("rejects values that fetch cannot use as HTTP(S) URLs", () => {
		expect(() => parseHttpUrl("not a URL")).toThrow("HTTP(S)");
		expect(() => parseHttpUrl("ftp://example.com/file")).toThrow("HTTP(S)");
	});

	test("keeps proxy paths under the configured base URL", () => {
		expect(
			appendUpstreamPath(
				parseHttpUrl("http://10.0.0.1:8080/api"),
				"v1/items",
				"",
			),
		).toEqual(new URL("http://10.0.0.1:8080/api/v1/items"));
		expect(() =>
			appendUpstreamPath(
				parseHttpUrl("http://10.0.0.1:8080/api"),
				"%2e%2e/admin",
				"",
			),
		).toThrow("invalid segment");
	});
});
