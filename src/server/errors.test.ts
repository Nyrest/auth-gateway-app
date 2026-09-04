import { describe, expect, test } from "bun:test";

import { asGatewayResponse, GatewayError } from "./errors";

describe("gateway error responses", () => {
	test("exposes a stable code and parameters without an English message", async () => {
		const response = asGatewayResponse(
			new GatewayError(400, "INVALID_UPSTREAM_URL", "English detail", {
				field: "baseUrl",
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			code: "INVALID_UPSTREAM_URL",
			params: { field: "baseUrl" },
		});
	});

	test("does not disclose unknown error messages", async () => {
		const response = asGatewayResponse(new Error("English internal detail"));

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			code: "INTERNAL_ERROR",
			params: {},
		});
	});
});
