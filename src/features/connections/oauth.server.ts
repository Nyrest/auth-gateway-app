import { and, eq, gt, isNull } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { getDb } from "#/db/index.server";
import {
	appSettings,
	oauthStates,
	providerInstances,
	providerSecrets,
} from "#/db/schema";
import { sha256 } from "#/server/config.server";
import {
	createAssociatedData,
	decryptSecret,
	encryptSecret,
} from "#/server/crypto.server";
import { applyCustomHeaders } from "#/server/custom-headers.server";
import { GatewayError } from "#/server/errors";
import {
	fetchUpstream,
	readJsonResponse,
} from "#/server/outbound-request.server";
import { parseHttpUrl } from "#/server/url.server";
import {
	createPkceChallenge,
	createPkceVerifier,
	parseOidcDiscoveryDocument,
} from "./providers/oidc";
import { readConnectionSecrets } from "./secrets.server";
import { getOAuthEndpoints, getProviderTemplate } from "./templates";

type OAuthEndpoints = {
	readonly authorizationUrl: string;
	readonly tokenUrl: string;
};

type TokenResponse = {
	readonly access_token?: string;
	readonly expires_in?: number;
	readonly refresh_token?: string;
	readonly token_type?: string;
};

class LeaseLostError extends Error {}

function randomBase64Url(bytes = 32): string {
	const value = new Uint8Array(bytes);
	crypto.getRandomValues(value);
	return Buffer.from(value).toString("base64url");
}

function configString(config: unknown, key: string): string | undefined {
	if (!config || typeof config !== "object" || Array.isArray(config)) {
		return undefined;
	}
	const value = (config as Record<string, unknown>)[key];
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function publicCallback(origin: string): string {
	return `${origin}/oauth/callback`;
}

function normalisePublicOrigin(value: string | null): string {
	if (!value) {
		throw new GatewayError(
			400,
			"PUBLIC_ORIGIN_NOT_SET",
			"Set the public origin before connecting OAuth.",
		);
	}
	const url = new URL(value);
	return url.origin;
}

async function validateOAuthEndpoint(
	value: string,
	label: string,
): Promise<string> {
	try {
		return parseHttpUrl(value).toString();
	} catch {
		throw new GatewayError(
			400,
			"INVALID_OAUTH_ENDPOINT",
			`${label} must be a valid HTTP(S) URL.`,
		);
	}
}

async function resolveOAuthEndpoints(
	templateSlug: string,
	config: unknown,
	secrets: ReadonlyMap<string, string>,
): Promise<OAuthEndpoints> {
	const predefined = getOAuthEndpoints(templateSlug);
	if (predefined) {
		return {
			authorizationUrl: await validateOAuthEndpoint(
				predefined.authorizationUrl,
				"Authorization URL",
			),
			tokenUrl: await validateOAuthEndpoint(predefined.tokenUrl, "Token URL"),
		};
	}
	if (
		templateSlug === "generic_oauth2" ||
		templateSlug === "generic_mcp_oauth"
	) {
		const authorizationUrl = configString(config, "authorization_url");
		const tokenUrl = configString(config, "token_url");
		if (!authorizationUrl || !tokenUrl) {
			throw new GatewayError(
				400,
				"OAUTH_ENDPOINTS_REQUIRED",
				"Provide both authorization and token URLs.",
			);
		}
		return {
			authorizationUrl: await validateOAuthEndpoint(
				authorizationUrl,
				"Authorization URL",
			),
			tokenUrl: await validateOAuthEndpoint(tokenUrl, "Token URL"),
		};
	}
	if (templateSlug === "generic_oidc") {
		const issuer = configString(config, "issuer") ?? secrets.get("issuer");
		if (!issuer) {
			throw new GatewayError(
				400,
				"OIDC_ISSUER_REQUIRED",
				"An OIDC issuer is required.",
			);
		}
		const issuerUrl = parseHttpUrl(issuer);
		const discoveryUrl = new URL(
			".well-known/openid-configuration",
			`${issuerUrl.toString().replace(/\/$/, "")}/`,
		);
		const discoveryHeaders = new Headers({ accept: "application/json" });
		applyCustomHeaders(discoveryHeaders, secrets);
		let response: Response;
		try {
			response = await fetchUpstream(discoveryUrl, {
				headers: discoveryHeaders,
				redirect: "error",
				timeoutMs: 10_000,
			});
		} catch {
			throw new GatewayError(
				502,
				"OIDC_DISCOVERY_FAILED",
				"The OIDC discovery document could not be fetched.",
			);
		}
		if (!response.ok) {
			await response.body?.cancel().catch(() => undefined);
			throw new GatewayError(
				502,
				"OIDC_DISCOVERY_FAILED",
				"The OIDC discovery document returned an error.",
			);
		}
		const document = parseOidcDiscoveryDocument(
			await readJsonResponse(response).catch(() => null),
		);
		if (!document) {
			throw new GatewayError(
				502,
				"OIDC_DISCOVERY_FAILED",
				"The OIDC discovery document is invalid.",
			);
		}
		const discoveredIssuer = await validateOAuthEndpoint(
			document.issuer,
			"OIDC issuer",
		);
		if (
			new URL(discoveredIssuer).toString().replace(/\/$/, "") !==
			issuerUrl.toString().replace(/\/$/, "")
		) {
			throw new GatewayError(
				502,
				"OIDC_DISCOVERY_FAILED",
				"The OIDC discovery issuer did not match the configured issuer.",
			);
		}
		return {
			authorizationUrl: await validateOAuthEndpoint(
				document.authorizationEndpoint,
				"OIDC authorization endpoint",
			),
			tokenUrl: await validateOAuthEndpoint(
				document.tokenEndpoint,
				"OIDC token endpoint",
			),
		};
	}
	throw new GatewayError(
		400,
		"OAUTH_NOT_SUPPORTED",
		"This connection does not use OAuth.",
	);
}

function asTokenResponse(payload: unknown): TokenResponse {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		throw new GatewayError(
			502,
			"OAUTH_TOKEN_INVALID",
			"The OAuth token response was invalid.",
		);
	}
	const result = payload as Record<string, unknown>;
	return {
		access_token:
			typeof result.access_token === "string" ? result.access_token : undefined,
		expires_in:
			typeof result.expires_in === "number" ? result.expires_in : undefined,
		refresh_token:
			typeof result.refresh_token === "string"
				? result.refresh_token
				: undefined,
		token_type:
			typeof result.token_type === "string" ? result.token_type : undefined,
	};
}

async function requestToken(
	tokenUrl: string,
	body: URLSearchParams,
	secrets: ReadonlyMap<string, string>,
): Promise<TokenResponse> {
	let response: Response;
	try {
		const headers = new Headers({
			accept: "application/json",
			"content-type": "application/x-www-form-urlencoded",
		});
		applyCustomHeaders(headers, secrets);
		response = await fetchUpstream(tokenUrl, {
			method: "POST",
			headers,
			body,
			redirect: "error",
			timeoutMs: 15_000,
		});
	} catch (error) {
		if (
			error instanceof GatewayError &&
			error.code === "INVALID_INJECTED_HEADER"
		) {
			throw error;
		}
		throw new GatewayError(
			502,
			"OAUTH_TOKEN_REQUEST_FAILED",
			"The OAuth token endpoint could not be reached.",
		);
	}
	const payload = await readJsonResponse(response).catch(() => null);
	if (!response.ok) {
		throw new GatewayError(
			502,
			"OAUTH_TOKEN_REQUEST_FAILED",
			"The OAuth token endpoint rejected the request.",
		);
	}
	const token = asTokenResponse(payload);
	if (!token.access_token) {
		throw new GatewayError(
			502,
			"OAUTH_TOKEN_INVALID",
			"The OAuth token response has no access token.",
		);
	}
	return token;
}

async function persistToken(input: {
	readonly instanceId: string;
	readonly userId: string;
	readonly token: TokenResponse;
	readonly expectedRefreshLeaseUntil?: Date;
}): Promise<boolean> {
	const now = new Date();
	const expiresAt = input.token.expires_in
		? new Date(now.getTime() + input.token.expires_in * 1_000)
		: null;
	const refreshDueAt = input.token.refresh_token
		? new Date(
				Math.max(
					now.getTime() + 60_000,
					(expiresAt?.getTime() ?? now.getTime() + 40 * 60_000) - 20 * 60_000,
				),
			)
		: null;
	const secretRows = await Promise.all(
		[
			["access_token", input.token.access_token],
			["refresh_token", input.token.refresh_token],
		]
			.filter((entry): entry is [string, string] => Boolean(entry[1]))
			.map(async ([fieldKey, value]) => ({
				id: uuidv7(),
				userId: input.userId,
				instanceId: input.instanceId,
				fieldKey,
				envelope: await encryptSecret(
					value,
					createAssociatedData(input.userId, input.instanceId, fieldKey),
				),
				createdAt: now,
				updatedAt: now,
			})),
	);
	try {
		const db = getDb();
		const where = and(
			eq(providerInstances.id, input.instanceId),
			eq(providerInstances.userId, input.userId),
			...(input.expectedRefreshLeaseUntil
				? [
						eq(
							providerInstances.refreshLeaseUntil,
							input.expectedRefreshLeaseUntil,
						),
					]
				: []),
		);
		if (input.expectedRefreshLeaseUntil) {
			const [lease] = await db
				.select({ id: providerInstances.id })
				.from(providerInstances)
				.where(where)
				.limit(1);
			if (!lease) throw new LeaseLostError();
		}
		for (const row of secretRows) {
			await db
				.insert(providerSecrets)
				.values(row)
				.onConflictDoUpdate({
					target: [providerSecrets.instanceId, providerSecrets.fieldKey],
					set: {
						envelope: row.envelope,
						updatedAt: now,
					},
				});
		}
		const [updated] = await db
			.update(providerInstances)
			.set({
				accessTokenExpiresAt: expiresAt,
				health: "unknown",
				refreshDueAt,
				status: "active",
				updatedAt: now,
			})
			.where(where)
			.returning({ id: providerInstances.id });
		if (input.expectedRefreshLeaseUntil && !updated) {
			throw new LeaseLostError();
		}
		return Boolean(updated);
	} catch (error) {
		if (error instanceof LeaseLostError) return false;
		throw error;
	}
}

export async function beginOAuthConnection(
	userId: string,
	instanceId: string,
): Promise<{ readonly authorizationUrl: string }> {
	const db = getDb();
	const [instance] = await db
		.select()
		.from(providerInstances)
		.where(
			and(
				eq(providerInstances.id, instanceId),
				eq(providerInstances.userId, userId),
			),
		)
		.limit(1);
	if (!instance) {
		throw new GatewayError(
			404,
			"CONNECTION_NOT_FOUND",
			"Connection not found.",
		);
	}
	const secrets = await readConnectionSecrets(userId, instance.id);
	const endpoints = await resolveOAuthEndpoints(
		instance.templateSlug,
		instance.config,
		secrets,
	);
	const clientId =
		configString(instance.config, "client_id") ?? secrets.get("client_id");
	if (!clientId) {
		throw new GatewayError(
			400,
			"OAUTH_CLIENT_REQUIRED",
			"A client ID is required to connect OAuth.",
		);
	}
	const [settings] = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.id, "primary"))
		.limit(1);
	const callback = publicCallback(
		normalisePublicOrigin(settings?.publicOrigin ?? null),
	);
	const state = randomBase64Url();
	const verifier = createPkceVerifier();
	const now = new Date();
	await db.batch([
		db.insert(oauthStates).values({
			id: uuidv7(),
			stateDigest: sha256(state),
			verifierEnvelope: await encryptSecret(
				verifier,
				createAssociatedData(userId, instance.id, "oauth_verifier"),
			),
			userId,
			instanceId,
			expiresAt: new Date(now.getTime() + 10 * 60_000),
			createdAt: now,
			updatedAt: now,
		}),
		db
			.update(providerInstances)
			.set({ status: "connecting", updatedAt: now })
			.where(
				and(
					eq(providerInstances.id, instance.id),
					eq(providerInstances.userId, userId),
				),
			),
	]);
	const authorize = new URL(endpoints.authorizationUrl);
	authorize.searchParams.set("client_id", clientId);
	authorize.searchParams.set("redirect_uri", callback);
	authorize.searchParams.set("response_type", "code");
	authorize.searchParams.set("state", state);
	authorize.searchParams.set(
		"code_challenge",
		await createPkceChallenge(verifier),
	);
	authorize.searchParams.set("code_challenge_method", "S256");
	const scopes =
		configString(instance.config, "scopes") ??
		getProviderTemplate(instance.templateSlug)?.defaultScopes;
	if (scopes) {
		authorize.searchParams.set("scope", scopes);
	}
	if (getProviderTemplate(instance.templateSlug)?.mcp) {
		authorize.searchParams.set("resource", instance.baseUrl);
	}
	return { authorizationUrl: authorize.toString() };
}

export async function getOAuthClientMetadata(
	connectionId: string,
): Promise<Record<string, unknown>> {
	const [instance] = await getDb()
		.select()
		.from(providerInstances)
		.where(eq(providerInstances.id, connectionId))
		.limit(1);
	if (!instance)
		throw new GatewayError(
			404,
			"CONNECTION_NOT_FOUND",
			"Connection not found.",
		);
	const [settings] = await getDb()
		.select()
		.from(appSettings)
		.where(eq(appSettings.id, "primary"))
		.limit(1);
	const origin = normalisePublicOrigin(settings?.publicOrigin ?? null);
	return {
		client_name: "Auth Gateway MCP client",
		redirect_uris: [publicCallback(origin)],
		grant_types: ["authorization_code", "refresh_token"],
		response_types: ["code"],
		token_endpoint_auth_method: "none",
	};
}

export async function finishOAuthConnection(callback: {
	readonly code?: string;
	readonly error?: string;
	readonly state: string;
}): Promise<{ readonly success: boolean; readonly message: string }> {
	const { code, error: providerError, state } = callback;
	const db = getDb();
	const [record] = await db
		.update(oauthStates)
		.set({ consumedAt: new Date(), updatedAt: new Date() })
		.where(
			and(
				eq(oauthStates.stateDigest, sha256(state)),
				isNull(oauthStates.consumedAt),
				gt(oauthStates.expiresAt, new Date()),
			),
		)
		.returning();
	if (!record) {
		throw new GatewayError(
			400,
			"OAUTH_STATE_INVALID",
			"OAuth state is invalid or has expired.",
		);
	}
	if (providerError || !code) {
		await db
			.update(providerInstances)
			.set({ status: "invalid", updatedAt: new Date() })
			.where(
				and(
					eq(providerInstances.id, record.instanceId),
					eq(providerInstances.userId, record.userId),
				),
			);
		throw new GatewayError(
			400,
			"OAUTH_DENIED",
			"The OAuth provider denied the connection request.",
		);
	}
	const [instance] = await db
		.select()
		.from(providerInstances)
		.where(
			and(
				eq(providerInstances.id, record.instanceId),
				eq(providerInstances.userId, record.userId),
			),
		)
		.limit(1);
	if (!instance) {
		throw new GatewayError(
			404,
			"CONNECTION_NOT_FOUND",
			"The OAuth connection no longer exists.",
		);
	}
	const secrets = await readConnectionSecrets(record.userId, record.instanceId);
	const [settings] = await db
		.select()
		.from(appSettings)
		.where(eq(appSettings.id, "primary"))
		.limit(1);
	const body = new URLSearchParams({
		client_id:
			configString(instance.config, "client_id") ??
			secrets.get("client_id") ??
			"",
		client_secret: secrets.get("client_secret") ?? "",
		code,
		code_verifier: await decryptSecret(
			record.verifierEnvelope,
			createAssociatedData(record.userId, record.instanceId, "oauth_verifier"),
		),
		grant_type: "authorization_code",
		redirect_uri: publicCallback(
			normalisePublicOrigin(settings?.publicOrigin ?? null),
		),
	});
	if (getProviderTemplate(instance.templateSlug)?.mcp) {
		body.set("resource", instance.baseUrl);
	}
	const token = await requestToken(
		(
			await resolveOAuthEndpoints(
				instance.templateSlug,
				instance.config,
				secrets,
			)
		).tokenUrl,
		body,
		secrets,
	);
	await persistToken({ instanceId: instance.id, token, userId: record.userId });
	return {
		success: true,
		message:
			"OAuth connection completed. Verify the connection before proxying traffic.",
	};
}

export async function connectClientCredentials(
	userId: string,
	instanceId: string,
): Promise<void> {
	const [instance] = await getDb()
		.select()
		.from(providerInstances)
		.where(
			and(
				eq(providerInstances.id, instanceId),
				eq(providerInstances.userId, userId),
			),
		)
		.limit(1);
	if (
		!instance ||
		instance.templateSlug !== "generic_oauth2" ||
		configString(instance.config, "grant_type") !== "client_credentials"
	) {
		throw new GatewayError(
			400,
			"CLIENT_CREDENTIALS_UNAVAILABLE",
			"This connection is not configured for client credentials.",
		);
	}
	const secrets = await readConnectionSecrets(userId, instanceId);
	const tokenUrl = (
		await resolveOAuthEndpoints(instance.templateSlug, instance.config, secrets)
	).tokenUrl;
	const body = new URLSearchParams({
		client_id:
			configString(instance.config, "client_id") ??
			secrets.get("client_id") ??
			"",
		client_secret: secrets.get("client_secret") ?? "",
		grant_type: "client_credentials",
	});
	const scopes =
		configString(instance.config, "scopes") ??
		getProviderTemplate(instance.templateSlug)?.defaultScopes;
	if (scopes) {
		body.set("scope", scopes);
	}
	await persistToken({
		instanceId,
		token: await requestToken(tokenUrl, body, secrets),
		userId,
	});
}

export async function refreshOAuthConnection(
	instanceId: string,
	userId: string,
	expectedRefreshLeaseUntil?: Date,
): Promise<boolean> {
	const [instance] = await getDb()
		.select()
		.from(providerInstances)
		.where(
			and(
				eq(providerInstances.id, instanceId),
				eq(providerInstances.userId, userId),
			),
		)
		.limit(1);
	if (!instance) {
		return false;
	}
	try {
		const secrets = await readConnectionSecrets(userId, instanceId);
		const refreshToken = secrets.get("refresh_token");
		if (!refreshToken) {
			return false;
		}
		const body = new URLSearchParams({
			client_id:
				configString(instance.config, "client_id") ??
				secrets.get("client_id") ??
				"",
			client_secret: secrets.get("client_secret") ?? "",
			grant_type: "refresh_token",
			refresh_token: refreshToken,
		});
		if (getProviderTemplate(instance.templateSlug)?.mcp) {
			body.set("resource", instance.baseUrl);
		}
		const token = await requestToken(
			(
				await resolveOAuthEndpoints(
					instance.templateSlug,
					instance.config,
					secrets,
				)
			).tokenUrl,
			body,
			secrets,
		);
		const persisted = await persistToken({
			instanceId,
			token: { ...token, refresh_token: token.refresh_token ?? refreshToken },
			userId,
			expectedRefreshLeaseUntil,
		});
		return persisted;
	} catch {
		await getDb()
			.update(providerInstances)
			.set({
				health: "unhealthy",
				refreshDueAt: null,
				status: "invalid",
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(providerInstances.id, instanceId),
					eq(providerInstances.userId, userId),
					...(expectedRefreshLeaseUntil
						? [
								eq(
									providerInstances.refreshLeaseUntil,
									expectedRefreshLeaseUntil,
								),
							]
						: []),
				),
			);
		return false;
	}
}
