import { createMiddleware } from "@tanstack/react-start";

const CONTENT_SECURITY_POLICY =
	"default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';";

/** Apply the same browser and transport protections on every deployment adapter. */
export function secureResponse(request: Request, response: Response): Response {
	const headers = new Headers(response.headers);
	const url = new URL(request.url);

	if (url.protocol === "https:") {
		headers.set(
			"strict-transport-security",
			"max-age=31536000; includeSubDomains",
		);
	}
	headers.set("x-content-type-options", "nosniff");
	headers.set("x-frame-options", "DENY");
	headers.set("referrer-policy", "no-referrer");
	headers.set("permissions-policy", "camera=(), geolocation=(), microphone=()");

	if (!url.pathname.startsWith("/endpoint/")) {
		headers.set("content-security-policy", CONTENT_SECURITY_POLICY);
		headers.set("cache-control", headers.get("cache-control") ?? "no-store");
	}

	return new Response(response.body, {
		headers,
		status: response.status,
		statusText: response.statusText,
	});
}

export const securityHeadersMiddleware = createMiddleware().server(
	async ({ next, request }) => {
		const result = await next();
		return {
			...result,
			response: secureResponse(request, result.response),
		};
	},
);
