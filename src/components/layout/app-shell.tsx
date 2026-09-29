import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
	BookOpenText,
	KeyRound,
	LayoutDashboard,
	LogOut,
	Play,
	PlugZap,
	Settings,
	ShieldCheck,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { LanguageSelector } from "#/components/language-selector";
import { ThemeToggle } from "#/components/theme-toggle";
import { authClient } from "#/features/auth/auth-client";
import { m } from "#/paraglide/messages.js";

import styles from "./app-shell.module.css";

const navigation = [
	{ icon: LayoutDashboard, label: () => m.overview(), to: "/" },
	{ icon: PlugZap, label: () => m.connections(), to: "/connections" },
	{ icon: Play, label: () => m.playground(), to: "/playground" },
	{ icon: KeyRound, label: () => m.api_keys(), to: "/api-keys" },
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
	const isNavigationLoading = useRouterState({
		select: (state) => state.isLoading,
	});
	const [showPendingIndicator, setShowPendingIndicator] = useState(false);
	useEffect(() => {
		if (!isNavigationLoading) {
			setShowPendingIndicator(false);
			return;
		}
		const timer = window.setTimeout(() => setShowPendingIndicator(true), 150);
		return () => window.clearTimeout(timer);
	}, [isNavigationLoading]);
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
				{showPendingIndicator ? (
					<div className={styles.pendingIndicator} aria-hidden="true" />
				) : null}
				<header className={styles.header}>
					<span className={styles.breadcrumb}>
						{m.overview()} / {getPageLabel(pathname)}
					</span>
					<div className={styles.headerActions}>
						<LanguageSelector />
						<ThemeToggle />
					</div>
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
	readonly description?: string;
	readonly title: string;
}) {
	return (
		<div className={styles.pageHeader}>
			<div>
				<h1>{title}</h1>
				{description ? <p>{description}</p> : null}
			</div>
			{actions ? <div className={styles.pageActions}>{actions}</div> : null}
		</div>
	);
}
