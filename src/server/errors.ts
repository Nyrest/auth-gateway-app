export class GatewayError extends Error {
	public readonly status: number;
	public readonly code: string;

	public constructor(status: number, code: string, message: string) {
		super(message);
		this.name = "GatewayError";
		this.status = status;
		this.code = code;
	}
}

export function asGatewayResponse(error: unknown): Response {
	if (error instanceof GatewayError) {
		return Response.json(
			{ code: error.code, message: error.message },
			{ headers: { "cache-control": "no-store" }, status: error.status },
		);
	}

	return Response.json(
		{
			code: "INTERNAL_ERROR",
			message: "The gateway could not complete this request.",
		},
		{ headers: { "cache-control": "no-store" }, status: 500 },
	);
}
