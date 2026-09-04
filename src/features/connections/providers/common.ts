import type { ProviderField } from "./types";

export const baseUrlField: ProviderField = {
	key: "base_url",
	labelKey: "provider_field_base_url",
	descriptionKey: "provider_field_base_url_description",
	type: "string",
	required: true,
	secret: false,
	outboundUrl: "absolute",
};

export const testFields: readonly ProviderField[] = [
	{
		key: "test_method",
		labelKey: "provider_field_test_method",
		descriptionKey: "provider_field_test_method_description",
		type: "single_select",
		required: false,
		secret: false,
		defaultValue: "GET",
		options: ["GET", "POST"],
	},
	{
		key: "test_url",
		labelKey: "provider_field_test_url",
		descriptionKey: "provider_field_test_url_description",
		type: "string",
		required: true,
		secret: false,
		outboundUrl: "relative_or_absolute",
	},
	{
		key: "test_body",
		labelKey: "provider_field_test_body",
		descriptionKey: "provider_field_test_body_description",
		type: "json",
		required: false,
		secret: false,
	},
];

export function stringField(
	key: string,
	labelKey: ProviderField["labelKey"],
	options: Pick<ProviderField, "required" | "secret"> &
		Partial<Pick<ProviderField, "descriptionKey" | "outboundUrl">>,
): ProviderField {
	return {
		key,
		labelKey,
		descriptionKey:
			options.descriptionKey ??
			(`${labelKey}_description` as ProviderField["descriptionKey"]),
		type: "string",
		required: options.required,
		secret: options.secret,
		...(options.outboundUrl ? { outboundUrl: options.outboundUrl } : {}),
	};
}
