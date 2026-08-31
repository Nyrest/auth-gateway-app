import { m } from "#/paraglide/messages.js";

export type SetupField = "name" | "email" | "password" | "publicOrigin";
export type SetupFieldErrors = Partial<Record<SetupField, string>>;

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
	return typeof value === "object" && value !== null;
}

function parsePayload(value: unknown): unknown {
	let payload = value;
	for (let index = 0; index < 2 && typeof payload === "string"; index += 1) {
		try {
			payload = JSON.parse(payload) as unknown;
		} catch {
			break;
		}
	}
	return payload;
}

function getIssueList(payload: unknown): unknown[] {
	if (Array.isArray(payload)) return payload;
	if (isRecord(payload)) {
		if (Array.isArray(payload.issues)) return payload.issues;
		if (Array.isArray(payload.errors)) return payload.errors;
	}
	return [];
}

function fieldFromIssue(issue: RecordValue): SetupField | undefined {
	const path = issue.path;
	if (!Array.isArray(path)) return undefined;
	const field = path[0];
	return field === "name" ||
		field === "email" ||
		field === "password" ||
		field === "publicOrigin"
		? field
		: undefined;
}

function messageForIssue(field: SetupField, issue: RecordValue): string {
	const code = issue.code;
	if (field === "name") {
		if (code === "too_small") return m.name_required();
		if (code === "too_big") return m.name_too_long();
		return m.invalid_name();
	}
	if (field === "email") {
		return code === "too_small" ? m.email_required() : m.email_invalid();
	}
	if (field === "password") {
		if (code === "too_small") return m.password_too_short();
		if (code === "too_big") return m.password_too_long();
		return m.password_required();
	}
	return code === "too_small"
		? m.public_origin_required()
		: m.public_origin_invalid();
}

function getRawErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (isRecord(error) && typeof error.message === "string") {
		return error.message;
	}
	return "";
}

function getPayload(error: unknown): unknown {
	const source =
		error instanceof Error
			? error.message
			: isRecord(error) && typeof error.message === "string"
				? error.message
				: error;
	const payload = parsePayload(source);
	return isRecord(payload) && isRecord(payload.data) ? payload.data : payload;
}

export function getSetupFieldErrors(error: unknown): SetupFieldErrors {
	const payload = getPayload(error);
	const rawMessage = getRawErrorMessage(error);
	const errors: SetupFieldErrors = {};

	for (const value of getIssueList(payload)) {
		if (!isRecord(value)) continue;
		const field = fieldFromIssue(value);
		if (field && !errors[field]) errors[field] = messageForIssue(field, value);
	}

	if (isRecord(payload) && payload.code === "INVALID_PUBLIC_ORIGIN") {
		const message = typeof payload.message === "string" ? payload.message : "";
		errors.publicOrigin = message.includes("path")
			? m.public_origin_restricted()
			: m.public_origin_https();
	} else if (rawMessage.includes("public origin must not include")) {
		errors.publicOrigin = m.public_origin_restricted();
	} else if (rawMessage.includes("Use HTTPS")) {
		errors.publicOrigin = m.public_origin_https();
	}

	return errors;
}

export function getSetupFormError(error: unknown): string | undefined {
	const payload = getPayload(error);
	if (isRecord(payload) && payload.code === "SETUP_ALREADY_CLAIMED") {
		return m.setup_already_claimed();
	}
	const rawMessage = getRawErrorMessage(error);
	if (rawMessage.includes("already been claimed"))
		return m.setup_already_claimed();
	return undefined;
}
