import { describe, expect, test } from "bun:test";

import { createAuthBaseUrl } from "./auth-origin.server";

describe("createAuthBaseUrl", () => {
	test("allows the installed host and both loopback hosts on any port", () => {
		expect(
			createAuthBaseUrl("https://auth-gateway-app.luna.workers.dev"),
		).toEqual({
			allowedHosts: [
				"auth-gateway-app.luna.workers.dev",
				"localhost:*",
				"127.0.0.1:*",
			],
			protocol: "auto",
		});
	});

	test("keeps an explicitly configured public port", () => {
		expect(createAuthBaseUrl("https://gateway.example.test:8443")).toEqual({
			allowedHosts: ["gateway.example.test:8443", "localhost:*", "127.0.0.1:*"],
			protocol: "auto",
		});
	});
});
