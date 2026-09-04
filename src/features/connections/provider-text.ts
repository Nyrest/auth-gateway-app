import { m } from "#/paraglide/messages.js";
import type {
	MessageKey,
	ProviderField,
	ProviderTemplate,
} from "./providers/types";

function resolve(key: MessageKey): string {
	// Generated messages have heterogeneous input types; provider metadata uses
	// only no-input messages, so this narrow cast keeps the registry typed.
	return (m[key] as unknown as () => string)();
}

export function providerName(template: ProviderTemplate): string {
	return resolve(template.metadata.nameKey);
}

export function providerDescription(template: ProviderTemplate): string {
	return resolve(template.metadata.descriptionKey);
}

export function fieldLabel(field: ProviderField): string {
	return resolve(field.labelKey);
}

export function fieldDescription(field: ProviderField): string {
	return resolve(field.descriptionKey);
}

const optionLabels: Record<string, MessageKey> = {
	authorization_code: "provider_option_authorization_code",
	client_credentials: "provider_option_client_credentials",
};

export function fieldOptionLabel(option: string): string {
	const key = optionLabels[option];
	return key ? resolve(key) : option;
}
