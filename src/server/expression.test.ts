import { describe, expect, test } from "bun:test";

import { evaluateExpression } from "./expression.server";

describe("safe expression evaluation", () => {
	test("supports the documented deterministic helpers", () => {
		expect(evaluateExpression("sha={{ md5(hello) }}")).toBe(
			"sha=5d41402abc4b2a76b9719d911017c592",
		);
		expect(evaluateExpression("{{ randomInt(4,4) }}")).toBe("4");
		expect(evaluateExpression("{{ randomOne(alpha) }}")).toBe("alpha");
	});

	test("does not execute arbitrary expressions", () => {
		expect(() => evaluateExpression("{{ process.exit(1) }}")).toThrow();
		expect(() => evaluateExpression("{{ md5(unterminated ")).toThrow();
	});
});
