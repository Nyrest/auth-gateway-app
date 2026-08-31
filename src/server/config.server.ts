import { createHash, hkdfSync } from "node:crypto";

import { decodeRootSecret } from "#/runtime/secret.server";
import { getRuntimeFromStartContext } from "./request-runtime.server";

export type RuntimeConfig = {
	readonly rootSecret: Uint8Array;
};

function encodeBase64Url(value: Uint8Array): string {
	let binary = "";
	for (const byte of value) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function getRequiredRootSecret(): Uint8Array {
	const runtimeSecret = getRuntimeFromStartContext()?.services.rootSecret;
	return runtimeSecret && runtimeSecret.byteLength > 0
		? runtimeSecret
		: decodeRootSecret(process.env.AUTH_GATEWAY_SECRET ?? "");
}

export function getRuntimeConfig(): RuntimeConfig {
	return {
		rootSecret: getRequiredRootSecret(),
	};
}

export function deriveSecret(label: string, outputLength = 32): Uint8Array {
	const derived = hkdfSync(
		"sha256",
		getRuntimeConfig().rootSecret,
		new Uint8Array(),
		new TextEncoder().encode(`auth-gateway/${label}/v1`),
		outputLength,
	);
	return new Uint8Array(derived);
}

export function getBetterAuthSecret(): string {
	return encodeBase64Url(deriveSecret("better-auth"));
}

export function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

export function encodeSecretForDisplay(value: Uint8Array): string {
	return encodeBase64Url(value);
}
