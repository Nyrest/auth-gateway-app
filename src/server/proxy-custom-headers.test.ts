import { describe, expect, test } from "bun:test";

import { applyCustomHeaders } from "./custom-headers.server";

describe("proxy custom headers", () => {
	test("runs after provider headers and can override auth, fixed, and cookie headers", () => {
		const headers = new Headers({
			authorization: "Bearer generated",
			"x-provider-mode": "fixed",
		});
		applyCustomHeaders(
			headers,
			new Map([
				[
					"custom_headers",
					JSON.stringify([
						{ key: "Authorization", value: "{{md5(hello)}}" },
						{ key: "X-Provider-Mode", value: "custom" },
						{ key: "Cookie", value: "session=custom" },
					]),
				],
			]),
		);
		expect(headers.get("authorization")).toBe(
			"5d41402abc4b2a76b9719d911017c592",
		);
		expect(headers.get("x-provider-mode")).toBe("custom");
		expect(headers.get("cookie")).toBe("session=custom");
	});

	test("rejects platform-owned headers while allowing an empty configuration", () => {
		const empty = new Headers();
		expect(() => applyCustomHeaders(empty, new Map())).not.toThrow();
		expect(() =>
			applyCustomHeaders(
				new Headers(),
				new Map([
					[
						"custom_headers",
						JSON.stringify([{ key: "X-Forwarded-Anything", value: "x" }]),
					],
				]),
			),
		).toThrow("invalid custom headers");
	});
});
