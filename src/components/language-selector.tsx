import { Languages } from "lucide-react";

import { Button } from "#/components/ui/button";
import { m } from "#/paraglide/messages.js";
import { getLocale, setLocale } from "#/paraglide/runtime.js";

export function LanguageSelector() {
	const locale = getLocale();
	const nextLocale = locale === "en" ? "zh-CN" : "en";
	return (
		<Button
			aria-label={m.language()}
			onClick={() => setLocale(nextLocale, { reload: true })}
			size="icon"
			variant="ghost"
		>
			<Languages aria-hidden="true" size={18} />
			<span className="sr-only">
				{nextLocale === "en" ? m.english() : m.simplified_chinese()}
			</span>
		</Button>
	);
}
