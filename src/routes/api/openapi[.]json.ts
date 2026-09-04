import { createFileRoute } from "@tanstack/react-router";

const proxyOperation = {
	description:
		"Bearer API-key authenticated streaming proxy. Request bodies are limited to 100 MiB; upstream redirects are returned, not followed.",
	responses: {
		"200": { description: "Streaming upstream response" },
		"400": { description: "Invalid path or request policy" },
		"401": { description: "Invalid API key" },
		"403": { description: "Provider policy rejected the request" },
		"413": { description: "Request body exceeds 100 MiB" },
		"502": { description: "Upstream unavailable" },
	},
	security: [{ proxyApiKey: [] }],
	summary: "Proxy an upstream request",
} as const;

const specification = {
	info: { title: "Auth Gateway Proxy API", version: "1.0.0" },
	openapi: "3.1.0",
	paths: {
		"/endpoint/{providerSlug}/{path}": {
			delete: proxyOperation,
			get: proxyOperation,
			head: proxyOperation,
			options: proxyOperation,
			patch: proxyOperation,
			post: proxyOperation,
			put: proxyOperation,
			parameters: [
				{
					in: "path",
					name: "providerSlug",
					required: true,
					schema: {
						maxLength: 63,
						pattern: "^[a-z0-9][a-z0-9_-]{0,62}$",
						type: "string",
					},
				},
				{
					in: "path",
					name: "path",
					required: true,
					schema: { maxLength: 8192, type: "string" },
				},
			],
		},
	},
	components: {
		securitySchemes: {
			proxyApiKey: { bearerFormat: "API key", scheme: "bearer", type: "http" },
		},
	},
} as const;

export const Route = createFileRoute("/api/openapi.json")({
	server: {
		handlers: {
			GET: () =>
				Response.json(specification, {
					headers: { "cache-control": "no-store" },
				}),
		},
	},
});
