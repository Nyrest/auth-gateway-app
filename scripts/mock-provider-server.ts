/** Lightweight deterministic upstream used for live proxy/MCP checks. */
const port = Number(process.env.MOCK_PROVIDER_PORT ?? 8787);
const expected = {
	bearer: process.env.MOCK_BEARER ?? "test-bearer",
	apiKey: process.env.MOCK_API_KEY ?? "test-api-key",
	username: process.env.MOCK_USERNAME ?? "admin",
	password: process.env.MOCK_PASSWORD ?? "password",
};

function authorised(request: Request): boolean {
	const authorization = request.headers.get("authorization");
	if (authorization === `Bearer ${expected.bearer}`) return true;
	if (authorization === `Basic ${btoa(`${expected.username}:${expected.password}`)}`) return true;
	return request.headers.get("x-api-key") === expected.apiKey;
}

const fetchHandler = (request: Request): Response => {
	const url = new URL(request.url);
	if (url.pathname === "/mcp" && request.method === "GET") {
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(
					new TextEncoder().encode(
						"event: endpoint\ndata: https://upstream.invalid/message\n\n",
					),
				);
				controller.close();
			},
		});
		return new Response(stream, {
			headers: { "content-type": "text/event-stream" },
		});
	}
	if (!authorised(request)) return Response.json({ ok: false }, { status: 401 });
	return Response.json({ ok: true, method: request.method, path: url.pathname });
};

export default { fetch: fetchHandler };

if (import.meta.main) Bun.serve({ port, fetch: fetchHandler });
