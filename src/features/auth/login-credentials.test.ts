import { describe, expect, test } from "bun:test";

import { loginCredentialFields } from "./login-credentials";

describe("login credential fields", () => {
	test("uses the standard username and current-password autocomplete tokens", () => {
		expect(loginCredentialFields).toEqual({
			email: { autoComplete: "username", name: "username" },
			password: { autoComplete: "current-password", name: "password" },
		});
	});
});
