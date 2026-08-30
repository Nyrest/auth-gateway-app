import { randomBytes } from "node:crypto";

import { deriveSecret, encodeSecretForDisplay } from "./config.server";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const envelopeVersion = "v1";

function asArrayBuffer(value: Uint8Array): ArrayBuffer {
	const copy = new Uint8Array(value.byteLength);
	copy.set(value);
	return copy.buffer;
}

function encodeBase64Url(value: Uint8Array): string {
	return encodeSecretForDisplay(value);
}

function decodeBase64Url(value: string): Uint8Array {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
	const binary = atob(`${normalized}${padding}`);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getEncryptionKey(): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		asArrayBuffer(deriveSecret("provider-secret")),
		{ name: "AES-GCM" },
		false,
		["encrypt", "decrypt"],
	);
}

export function createAssociatedData(
	userId: string,
	instanceId: string,
	fieldKey: string,
): Uint8Array {
	return encoder.encode(`${userId}:${instanceId}:${fieldKey}`);
}

export async function encryptSecret(
	plaintext: string,
	associatedData: Uint8Array,
): Promise<string> {
	const nonce = randomBytes(12);
	const ciphertext = await crypto.subtle.encrypt(
		{
			name: "AES-GCM",
			iv: asArrayBuffer(nonce),
			additionalData: asArrayBuffer(associatedData),
		},
		await getEncryptionKey(),
		encoder.encode(plaintext),
	);
	return [
		envelopeVersion,
		encodeBase64Url(nonce),
		encodeBase64Url(new Uint8Array(ciphertext)),
	].join(".");
}

export async function decryptSecret(
	envelope: string,
	associatedData: Uint8Array,
): Promise<string> {
	const [version, nonce, ciphertext, ...rest] = envelope.split(".");
	if (
		version !== envelopeVersion ||
		!nonce ||
		!ciphertext ||
		rest.length !== 0
	) {
		throw new Error("Invalid secret envelope");
	}

	const plaintext = await crypto.subtle.decrypt(
		{
			name: "AES-GCM",
			iv: asArrayBuffer(decodeBase64Url(nonce)),
			additionalData: asArrayBuffer(associatedData),
		},
		await getEncryptionKey(),
		asArrayBuffer(decodeBase64Url(ciphertext)),
	);
	return decoder.decode(plaintext);
}

export function createApiKeySecret(): string {
	return encodeBase64Url(randomBytes(32));
}
