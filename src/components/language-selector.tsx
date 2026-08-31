import { Languages } from "lucide-react";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { m } from "#/paraglide/messages.js";
import { getLocale, locales, setLocale } from "#/paraglide/runtime.js";

type SupportedLocale = (typeof locales)[number];

export function LanguageSelector() {
	const locale = getLocale() as SupportedLocale;

	return (
		<Select
			value={locale}
			onValueChange={(value) => {
				if (locales.includes(value as SupportedLocale)) {
					void setLocale(value as SupportedLocale, { reload: true });
				}
			}}
		>
			<SelectTrigger aria-label={m.language()} size="sm">
				<Languages aria-hidden="true" size={16} />
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="en">{m.english()}</SelectItem>
				<SelectItem value="zh-CN">{m.simplified_chinese()}</SelectItem>
			</SelectContent>
		</Select>
	);
}
