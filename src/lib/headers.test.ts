import { describe, expect, test } from "bun:test";

import {
	headerConflicts,
	headersToJson,
	parseHeaderJson,
	parseStoredHeaders,
	serializeStoredHeaders,
	validateHeaderEntries,
} from "./headers";

describe("shared header codec", () => {
	test("round-trips visual entries through the JSON object format", () => {
		const entries = [
			{ key: "X-Tenant", value: "acme" },
			{ key: "X-Signature", value: "{{md5(secret)}}" },
		];
		const json = headersToJson(entries);
		expect(parseHeaderJson(json, "provider")).toEqual({ value: entries });
	});

	test("detects duplicate JSON keys case-insensitively", () => {
		expect(parseHeaderJson('{"X-Trace":"one","x-trace":"two"}')).toEqual({
			error: "invalid_headers",
		});
	});

	test("uses canonical arrays for encrypted persistence", () => {
		const entries = [{ key: "X-Tenant", value: "acme" }];
		const serialized = serializeStoredHeaders(entries);
		expect(serialized).toBe('[{"key":"X-Tenant","value":"acme"}]');
		expect(parseStoredHeaders(serialized, "provider")).toEqual({
			value: entries,
		});
		expect(parseStoredHeaders('{"X-Tenant":"acme"}', "provider")).toEqual({
			error: "invalid_headers",
		});
		expect(parseStoredHeaders(" ".repeat(600_000), "provider")).toEqual({
			error: "invalid_headers",
		});
	});

	test("enforces names, policy restrictions, duplicate keys, and limits", () => {
		expect(
			validateHeaderEntries([{ key: "bad name", value: "x" }], "provider"),
		).toEqual({ error: "invalid_headers" });
		expect(
			validateHeaderEntries(
				[{ key: "X".repeat(1_025), value: "x" }],
				"provider",
			),
		).toEqual({ error: "invalid_headers" });
		expect(validateHeaderEntries([{ key: "", value: "" }], "provider")).toEqual(
			{ error: "invalid_headers" },
		);
		expect(
			validateHeaderEntries(
				[{ key: "X-Test", value: "line\nfeed" }],
				"provider",
			),
		).toEqual({ error: "invalid_headers" });
		expect(
			validateHeaderEntries(
				[{ key: "X-Test", value: "null\u0000byte" }],
				"provider",
			),
		).toEqual({ error: "invalid_headers" });
		expect(
			validateHeaderEntries(
				[{ key: "X-Test", value: "😀".repeat(3_000) }],
				"provider",
			),
		).toEqual({ error: "invalid_headers" });
		expect(
			validateHeaderEntries(
				Array.from({ length: 51 }, (_, index) => ({
					key: `X-${index}`,
					value: "ok",
				})),
				"provider",
			),
		).toEqual({ error: "invalid_headers" });
		expect(
			validateHeaderEntries(
				[
					{ key: "X-Test", value: "one" },
					{ key: "x-test", value: "two" },
				],
				"provider",
			),
		).toEqual({ error: "invalid_headers" });
		expect(
			validateHeaderEntries(
				[{ key: "X-Forwarded-Anything", value: "x" }],
				"provider",
			),
		).toEqual({ error: "invalid_headers" });
		expect(
			validateHeaderEntries(
				[{ key: "Authorization", value: "override" }],
				"provider",
			),
		).toEqual({ value: [{ key: "Authorization", value: "override" }] });
		expect(
			validateHeaderEntries(
				[{ key: "Authorization", value: "override" }],
				"playground",
			),
		).toEqual({ error: "invalid_headers" });
	});

	test("reports non-blocking provider conflicts", () => {
		expect(
			headerConflicts(
				[
					{ key: "Authorization", value: "override" },
					{ key: "X-Tenant", value: "acme" },
				],
				["authorization", "X-Provider-Mode"],
			),
		).toEqual(["Authorization"]);
	});
});
