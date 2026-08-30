import { describe, expect, test } from "bun:test";

import { appendUpstreamPath, validateUpstreamUrl } from "./upstream-url.server";

describe("upstream URL validation", () => {
	test("rejects credentials, fragments, and private literals by default", () => {
		expect(() =>
			validateUpstreamUrl("https://user:pass@example.com", false),
		).toThrow();
		expect(() =>
			validateUpstreamUrl("https://example.com/api#secret", false),
		).toThrow();
		expect(() => validateUpstreamUrl("http://127.0.0.1:8080", false)).toThrow();
	});

	test("allows explicit private opt-in and blocks encoded traversal", () => {
		expect(validateUpstreamUrl("http://127.0.0.1:8080", true).hostname).toBe(
			"127.0.0.1",
		);
		expect(() =>
			appendUpstreamPath("https://api.example.com", "%2e%2e/admin", ""),
		).toThrow();
		expect(() =>
			appendUpstreamPath("https://api.example.com", "%252e%252e/admin", ""),
		).toThrow();
	});
});
