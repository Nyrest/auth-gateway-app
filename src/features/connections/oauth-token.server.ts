import { applyCustomHeaders } from "#/server/custom-headers.server";
import { GatewayError } from "#/server/errors";
import {
	fetchUpstream,
	readJsonResponse,
} from "#/server/outbound-request.server";

export type TokenResponse = {
	readonly access_token?: string;
	readonly expires_in?: number;
	readonly refresh_token?: string;
	readonly token_type?: string;
};

const publicOAuthErrors = new Set([
	"invalid_request",
	"invalid_client",
	"invalid_grant",
	"unauthorized_client",
	"unsupported_grant_type",
	"invalid_scope",
	"access_denied",
	"server_error",
	"temporarily_unavailable",
	"use_dpop_nonce",
]);

function publicOAuthError(payload: unknown): string | undefined {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		return undefined;
	}
	const error = (payload as Record<string, unknown>).error;
	return typeof error === "string" && publicOAuthErrors.has(error)
		? error
		: undefined;
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

export async function requestToken(
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
			{ stage: "transport" },
		);
	}
	const payload = await readJsonResponse(response).catch(() => null);
	if (!response.ok) {
		const providerError = publicOAuthError(payload);
		throw new GatewayError(
			502,
			"OAUTH_TOKEN_REQUEST_FAILED",
			"The OAuth token endpoint rejected the request.",
			{
				stage: "token_response",
				upstreamStatus: response.status,
				...(providerError ? { providerError } : {}),
			},
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
