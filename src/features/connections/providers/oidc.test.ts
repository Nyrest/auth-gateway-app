import { describe, expect, test } from "bun:test";

import { parseOidcDiscoveryDocument } from "./oidc";

describe("OIDC discovery parsing", () => {
	test("requires an issuer and both authorization endpoints", () => {
		expect(
			parseOidcDiscoveryDocument({
				authorization_endpoint: "https://id.example/authorize",
				token_endpoint: "https://id.example/token",
			}),
		).toBeUndefined();
		expect(
			parseOidcDiscoveryDocument({
				issuer: "https://id.example",
				authorization_endpoint: "https://id.example/authorize",
				token_endpoint: "https://id.example/token",
			}),
		).toMatchObject({ issuer: "https://id.example" });
	});
});
