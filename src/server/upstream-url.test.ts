import { describe, expect, test } from "bun:test";

import {
	appendUpstreamPath,
	assertPublicDnsAddresses,
	validateUpstreamUrl,
} from "./upstream-url.server";

describe("upstream URL validation", () => {
	test("rejects credentials, fragments, and private literals by default", () => {
		expect(() =>
			validateUpstreamUrl("https://user:pass@example.com", false),
		).toThrow();
		expect(() =>
			validateUpstreamUrl("https://example.com/api#secret", false),
		).toThrow();
		expect(() => validateUpstreamUrl("http://127.0.0.1:8080", false)).toThrow();
		expect(() => validateUpstreamUrl("http://api.example.com", false)).toThrow(
			"Public upstream URLs must use HTTPS.",
		);
	});

	test("allows explicit private opt-in and blocks encoded traversal", () => {
		expect(validateUpstreamUrl("http://127.0.0.1:8080", true).hostname).toBe(
			"127.0.0.1",
		);
		expect(() =>
			appendUpstreamPath(
				validateUpstreamUrl("https://api.example.com"),
				"%2e%2e/admin",
				"",
			),
		).toThrow();
		expect(() =>
			appendUpstreamPath(
				validateUpstreamUrl("https://api.example.com"),
				"%252e%252e/admin",
				"",
			),
		).toThrow();
	});

	test("limits HTTP to the private-network deployment mode", () => {
		expect(validateUpstreamUrl("http://127.0.0.1:8080", true).protocol).toBe(
			"http:",
		);
		expect(validateUpstreamUrl("https://api.example.com", false).protocol).toBe(
			"https:",
		);
	});

	test("rejects every private DNS answer and the complete IPv6 link-local range", () => {
		expect(() =>
			assertPublicDnsAddresses("upstream.example", ["203.0.113.10"]),
		).toThrow();
		expect(() =>
			assertPublicDnsAddresses("upstream.example", ["fe90::1"]),
		).toThrow();
		expect(() =>
			assertPublicDnsAddresses("upstream.example", ["febf::1"]),
		).toThrow();
		expect(() =>
			assertPublicDnsAddresses("upstream.example", ["8.8.8.8", "127.0.0.1"]),
		).toThrow();
		expect(() =>
			assertPublicDnsAddresses("upstream.example", ["8.8.8.8"]),
		).not.toThrow();
	});
});
