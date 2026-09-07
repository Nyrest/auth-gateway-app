import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";

// Better Auth validates its base URL while this module is loaded during SSR.
// The browser must use the current origin because the installed origin is runtime data.
const baseURL =
	typeof window === "undefined"
		? "http://localhost:3000"
		: window.location.origin;

export const authClient = createAuthClient({
	baseURL,
	plugins: [passkeyClient()],
});
