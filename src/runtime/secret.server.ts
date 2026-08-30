const requiredSecretLength = 32;

export function decodeRootSecret(value: string): Uint8Array {
	if (!/^[A-Za-z0-9_-]+$/.test(value)) {
		throw new Error("AUTH_GATEWAY_SECRET must be unpadded base64url");
	}
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
	const binary = atob(`${normalized}${padding}`);
	const secret = Uint8Array.from(binary, (character) =>
		character.charCodeAt(0),
	);
	if (secret.byteLength !== requiredSecretLength) {
		throw new Error("AUTH_GATEWAY_SECRET must decode to exactly 32 bytes");
	}
	return secret;
}
