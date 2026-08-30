import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getSession } from "./auth.server";
import { GatewayError } from "./errors";

export const requireUser = createMiddleware().server(async ({ next }) => {
	const session = await getSession(getRequest().headers);
	if (!session) {
		throw new GatewayError(401, "UNAUTHENTICATED", "Sign in is required.");
	}

	return next({ context: { userId: session.user.id, session } });
});
