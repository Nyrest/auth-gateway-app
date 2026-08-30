import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

import { securityHeadersMiddleware } from "#/server/security-headers";

const csrfMiddleware = createCsrfMiddleware({
	filter: (context) => context.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
	requestMiddleware: [securityHeadersMiddleware, csrfMiddleware],
}));
