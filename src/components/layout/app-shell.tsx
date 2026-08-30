import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
	Activity,
	BarChart3,
	BookOpenText,
	KeyRound,
	LayoutDashboard,
	LogOut,
	Moon,
	PlugZap,
	Settings,
	ShieldCheck,
	Sun,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { LanguageSelector } from "#/components/language-selector";
import { authClient } from "#/features/auth/auth-client";
import { m } from "#/paraglide/messages.js";

import styles from "./app-shell.module.css";

const navigation = [
	{ icon: LayoutDashboard, label: () => m.overview(), to: "/" },
	{ icon: PlugZap, label: () => m.connections(), to: "/connections" },
	{ icon: KeyRound, label: () => m.api_keys(), to: "/api-keys" },
	{ icon: Activity, label: () => m.audit_log(), to: "/audit" },
	{ icon: BarChart3, label: () => m.statistics(), to: "/statistics" },
] as const;

function getPageLabel(pathname: string): string {
	return (
		navigation.find((item) => item.to === pathname)?.label() ?? m.overview()
	);
}

export function AppShell() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const [dark, setDark] = useState(false);

	useEffect(() => {
		const saved = window.localStorage.getItem("auth-gateway-theme");
		const prefersDark = window.matchMedia(
			"(prefers-color-scheme: dark)",
		).matches;
		setDark(saved === "dark" || (!saved && prefersDark));
	}, []);

	useEffect(() => {
		document.documentElement.classList.toggle("dark", dark);
		window.localStorage.setItem("auth-gateway-theme", dark ? "dark" : "light");
	}, [dark]);

	return (
		<div className={styles.shell}>
			<aside className={styles.sidebar} aria-label={m.overview()}>
				<Link to="/" className={styles.brand}>
					<span className={styles.brandMark} aria-hidden="true">
						<ShieldCheck size={18} />
					</span>
					<span className={styles.brandText}>
						<strong>{m.app_name()}</strong>
						<span>{m.connections()}</span>
					</span>
				</Link>

				<nav className={styles.navGroup}>
					<span className={styles.navLabel}>{m.overview()}</span>
					{navigation.map(({ icon: Icon, label, to }) => (
						<Link
							key={to}
							to={to}
							className={styles.navLink}
							activeProps={{
								className: `${styles.navLink} ${styles.navLinkActive}`,
							}}
						>
							<Icon size={17} aria-hidden="true" />
							{label()}
						</Link>
					))}
				</nav>

				<nav className={styles.navGroup}>
					<span className={styles.navLabel}>{m.documentation()}</span>
					<Link to="/docs" className={styles.navLink}>
						<BookOpenText size={17} aria-hidden="true" />
						{m.documentation()}
					</Link>
				</nav>

				<div className={styles.sidebarFooter}>
					<Link to="/settings" className={styles.navLink}>
						<Settings size={17} aria-hidden="true" />
						{m.settings()}
					</Link>
					<button
						className={styles.footerButton}
						onClick={() =>
							void authClient.signOut({
								fetchOptions: {
									onSuccess: () => window.location.assign("/login"),
								},
							})
						}
						type="button"
					>
						<LogOut size={17} aria-hidden="true" />
						{m.sign_out()}
					</button>
				</div>
			</aside>

			<main className={styles.main}>
				<header className={styles.header}>
					<span className={styles.breadcrumb}>
						{m.overview()} / {getPageLabel(pathname)}
					</span>
					<LanguageSelector />
					<button
						aria-label={dark ? "Use light theme" : "Use dark theme"}
						className="inline-flex size-9 items-center justify-center rounded-md border bg-background hover:bg-accent"
						onClick={() => setDark((value) => !value)}
						type="button"
					>
						{dark ? <Sun size={16} /> : <Moon size={16} />}
					</button>
				</header>
				<div className={styles.content}>
					<Outlet />
				</div>
			</main>
		</div>
	);
}

export function PageHeader({
	actions,
	description,
	title,
}: {
	readonly actions?: ReactNode;
	readonly description: string;
	readonly title: string;
}) {
	return (
		<div className={styles.pageHeader}>
			<div>
				<h1>{title}</h1>
				<p>{description}</p>
			</div>
			{actions ? <div className={styles.pageActions}>{actions}</div> : null}
		</div>
	);
}
