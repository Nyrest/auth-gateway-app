export type GatewayErrorParams = Readonly<Record<string, unknown>>;

export class GatewayError extends Error {
	public readonly status: number;
	public readonly code: string;
	public readonly params: GatewayErrorParams;

	public constructor(
		status: number,
		code: string,
		message: string,
		params: GatewayErrorParams = {},
	) {
		super(message);
		this.name = "GatewayError";
		this.status = status;
		this.code = code;
		this.params = params;
	}
}

export function asGatewayResponse(error: unknown): Response {
	if (error instanceof GatewayError) {
		return Response.json(
			{ code: error.code, params: error.params },
			{ headers: { "cache-control": "no-store" }, status: error.status },
		);
	}

	return Response.json(
		{
			code: "INTERNAL_ERROR",
			params: {},
		},
		{ headers: { "cache-control": "no-store" }, status: 500 },
	);
}
