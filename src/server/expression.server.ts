import { createHash } from "node:crypto";

import { GatewayError } from "./errors";

function randomUnit(): number {
	const value = new Uint32Array(1);
	crypto.getRandomValues(value);
	return value[0] / 0x1_0000_0000;
}

function evaluateCall(expression: string): string {
	const open = expression.indexOf("(");
	if (open < 1 || !expression.endsWith(")")) {
		throw new GatewayError(
			400,
			"INVALID_EXPRESSION",
			`Unsupported expression: ${expression}`,
		);
	}
	const name = expression.slice(0, open).trim();
	const args = expression
		.slice(open + 1, -1)
		.split(",")
		.map((argument) => argument.trim());

	if (name === "randomInt" && args.length === 2) {
		const min = Number.parseInt(args[0] ?? "", 10);
		const max = Number.parseInt(args[1] ?? "", 10);
		if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
			throw new GatewayError(
				400,
				"INVALID_EXPRESSION",
				"randomInt requires an ordered integer range.",
			);
		}
		return String(Math.floor(randomUnit() * (max - min + 1)) + min);
	}
	if (name === "randomFloat" && args.length === 2) {
		const min = Number.parseFloat(args[0] ?? "");
		const max = Number.parseFloat(args[1] ?? "");
		if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
			throw new GatewayError(
				400,
				"INVALID_EXPRESSION",
				"randomFloat requires an ordered numeric range.",
			);
		}
		return String(randomUnit() * (max - min) + min);
	}
	if (name === "randomOne" && args.length > 0) {
		return args[Math.floor(randomUnit() * args.length)] ?? "";
	}
	if (name === "md5" && args.length === 1) {
		return createHash("md5")
			.update(args[0] ?? "")
			.digest("hex");
	}
	throw new GatewayError(
		400,
		"INVALID_EXPRESSION",
		`Unsupported expression: ${expression}`,
	);
}

export function evaluateExpression(input: string): string {
	let output = "";
	let cursor = 0;
	while (cursor < input.length) {
		const start = input.indexOf("{{", cursor);
		if (start === -1) {
			return output + input.slice(cursor);
		}
		output += input.slice(cursor, start);
		const end = input.indexOf("}}", start + 2);
		if (end === -1) {
			throw new GatewayError(
				400,
				"INVALID_EXPRESSION",
				"Expression is missing closing braces.",
			);
		}
		output += evaluateCall(input.slice(start + 2, end).trim());
		cursor = end + 2;
	}
	return output;
}
