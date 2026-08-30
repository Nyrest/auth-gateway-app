import { describe, expect, test } from "bun:test";

import {
	createAssociatedData,
	decryptSecret,
	encryptSecret,
} from "./crypto.server";

process.env.AUTH_GATEWAY_SECRET = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("provider secret envelopes", () => {
	test("encrypts with random nonces and authenticates associated data", async () => {
		const associatedData = createAssociatedData(
			"user-a",
			"instance-a",
			"token",
		);
		const first = await encryptSecret("top secret", associatedData);
		const second = await encryptSecret("top secret", associatedData);
		expect(first).not.toBe(second);
		expect(await decryptSecret(first, associatedData)).toBe("top secret");
		await expect(
			decryptSecret(
				first,
				createAssociatedData("user-b", "instance-a", "token"),
			),
		).rejects.toThrow();
	});
});
