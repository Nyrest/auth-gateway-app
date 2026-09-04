import { getSession } from "./auth.server";
import { GatewayError } from "./errors";
import { proxyPlaygroundRequest } from "./proxy.server";

const connectionIdPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handlePlaygroundRequest(
	request: Request,
	connectionId: string,
	path: string,
): Promise<Response> {
	if (request.headers.get("x-auth-gateway-playground") !== "1") {
		throw new GatewayError(
			403,
			"PLAYGROUND_REQUEST_REQUIRED",
			"Invalid Playground request.",
		);
	}
	if (!connectionIdPattern.test(connectionId)) {
		throw new GatewayError(
			400,
			"INVALID_CONNECTION_ID",
			"The connection is invalid.",
		);
	}
	const session = await getSession(request.headers);
	if (!session) {
		throw new GatewayError(401, "UNAUTHENTICATED", "Sign in is required.");
	}
	return proxyPlaygroundRequest(request, session.user.id, connectionId, path);
}
