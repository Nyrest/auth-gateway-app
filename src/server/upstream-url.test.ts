import { describe, expect, test } from "bun:test";

import type { GatewayDatabase } from "#/db/index.server";
import type { RuntimeServices } from "#/runtime/contract.server";
import { runWithRuntimeContext } from "./request-runtime.server";
import {
	appendUpstreamPath,
	assertPublicDnsAddresses,
	validateOutboundUpstreamUrl,
	validateUpstreamUrl,
} from "./upstream-url.server";

describe("upstream URL validation", () => {
	test("rejects credentials, fragments, and non-loopback private literals by default", () => {
		expect(() =>
			validateUpstreamUrl("https://user:pass@example.com", false),
		).toThrow();
		expect(() =>
			validateUpstreamUrl("https://example.com/api#secret", false),
		).toThrow();
		expect(() =>
			validateUpstreamUrl("https://127.0.0.2:8080", false),
		).toThrow();
		expect(() => validateUpstreamUrl("http://api.example.com", false)).toThrow(
			"Public upstream URLs must use HTTPS.",
		);
	});

	test("always allows the explicit loopback origins without DNS resolution", async () => {
		const services: RuntimeServices = {
			database: undefined as unknown as GatewayDatabase,
			kind: "bun",
			resolveHostname: async () => {
				throw new Error("loopback origins must not depend on DNS");
			},
			rootSecret: new Uint8Array(32),
		};
		const validate = (value: string) =>
			runWithRuntimeContext(
				services,
				{ clientIp: null, deferPromise: (promise) => void promise },
				() => validateOutboundUpstreamUrl(value),
			);

		await expect(validate("http://localhost:3000")).resolves.toMatchObject({
			hostname: "localhost",
			protocol: "http:",
		});
		await expect(validate("http://127.0.0.1:6806")).resolves.toMatchObject({
			hostname: "127.0.0.1",
			protocol: "http:",
		});
		await expect(validate("http://localhost.:3000")).resolves.toMatchObject({
			hostname: "localhost.",
		});
	});

	test("allows explicit private opt-in and blocks encoded traversal", () => {
		expect(validateUpstreamUrl("http://10.0.0.1:8080", true).hostname).toBe(
			"10.0.0.1",
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

	test("limits non-loopback HTTP to the private-network deployment mode", () => {
		expect(validateUpstreamUrl("http://10.0.0.1:8080", true).protocol).toBe(
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
