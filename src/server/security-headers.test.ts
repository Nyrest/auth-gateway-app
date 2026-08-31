import { describe, expect, test } from "bun:test";

import { secureResponse } from "./security-headers";

describe("security response headers", () => {
	test("allows the inline TanStack Start hydration bootstrap", () => {
		const response = secureResponse(
			new Request("http://localhost:3000/setup"),
			new Response("ok"),
		);

		expect(response.headers.get("content-security-policy")).toContain(
			"script-src 'self' 'unsafe-inline'",
		);
	});
});
