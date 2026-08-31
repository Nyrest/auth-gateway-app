import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { m } from "#/paraglide/messages.js";

export const THEME_STORAGE_KEY = "auth-gateway-theme";

/** Apply the persisted theme before the app hydrates to avoid a light-theme flash. */
export const themeInitScript = `(() => {
  try {
    const saved = window.localStorage.getItem("${THEME_STORAGE_KEY}");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", saved === "dark" || (!saved && prefersDark));
  } catch {}
})();`;

function applyTheme(dark: boolean) {
	document.documentElement.classList.toggle("dark", dark);
	window.localStorage.setItem(THEME_STORAGE_KEY, dark ? "dark" : "light");
}

export function ThemeToggle() {
	const [dark, setDark] = useState(false);

	useEffect(() => {
		setDark(document.documentElement.classList.contains("dark"));
	}, []);

	function toggleTheme() {
		const nextDark = !document.documentElement.classList.contains("dark");
		applyTheme(nextDark);
		setDark(nextDark);
	}

	return (
		<button
			aria-label={dark ? m.use_light_theme() : m.use_dark_theme()}
			className="inline-flex size-9 items-center justify-center rounded-md border bg-background hover:bg-accent"
			onClick={toggleTheme}
			title={dark ? m.use_light_theme() : m.use_dark_theme()}
			type="button"
		>
			{dark ? (
				<Sun aria-hidden="true" size={16} />
			) : (
				<Moon aria-hidden="true" size={16} />
			)}
		</button>
	);
}
