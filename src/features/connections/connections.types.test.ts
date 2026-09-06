import { describe, expect, test } from "bun:test";

import {
	asConnectionEnabledResult,
	asJsonObject,
	isJsonValue,
} from "./connections.types";

describe("connection JSON data", () => {
	test("keeps enable and disable responses minimal", () => {
		const result = asConnectionEnabledResult(true);

		expect(result).toEqual({ enabled: true });
		expect(result).not.toHaveProperty("secretKeys");
	});

	test("rejects non-finite numbers before they can reach JSON storage", () => {
		expect(isJsonValue(Number.NaN)).toBeFalse();
		expect(isJsonValue(Number.POSITIVE_INFINITY)).toBeFalse();
		expect(asJsonObject({ retries: 3, timeout: Number.NaN })).toEqual({
			retries: 3,
		});
	});
});
