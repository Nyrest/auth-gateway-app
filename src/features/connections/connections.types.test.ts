import { describe, expect, test } from "bun:test";

import { asJsonObject, isJsonValue } from "./connections.types";

describe("connection JSON data", () => {
	test("rejects non-finite numbers before they can reach JSON storage", () => {
		expect(isJsonValue(Number.NaN)).toBeFalse();
		expect(isJsonValue(Number.POSITIVE_INFINITY)).toBeFalse();
		expect(asJsonObject({ retries: 3, timeout: Number.NaN })).toEqual({
			retries: 3,
		});
	});
});
