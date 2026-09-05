import { describe, expect, test } from "bun:test";

import { providerTemplates } from "./templates";

describe("provider template transport", () => {
	test("keeps runtime icon components out of Server Function results", () => {
		const serialized = JSON.stringify(providerTemplates);
		expect(serialized).not.toContain('"icon"');
		expect(JSON.parse(serialized)).toHaveLength(providerTemplates.length);
	});
});
