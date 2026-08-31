import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { LanguageSelector } from "#/components/language-selector";
import { ThemeToggle } from "#/components/theme-toggle";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { getSetupStatus } from "#/features/auth/auth.functions";
import { authClient } from "#/features/auth/auth-client";
import styles from "#/features/auth/auth-page.module.css";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/login")({
	beforeLoad: async () => {
		const status = await getSetupStatus();
		if (status.setupRequired) {
			throw redirect({ to: "/setup" });
		}
	},
	component: LoginPage,
});

function LoginPage() {
	const navigate = useNavigate();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string>();
	const [submitting, setSubmitting] = useState(false);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitting(true);
		setError(undefined);
		try {
			const result = await authClient.signIn.email({ email, password });
			if (result.error) {
				throw new Error(m.invalid_email_or_password());
			}
			await navigate({ to: "/" });
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : m.sign_in_failed());
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<main className={styles.page}>
			<div className={styles.panel}>
				<div className="absolute right-4 top-4 flex items-center gap-2">
					<LanguageSelector />
					<ThemeToggle />
				</div>
				<div className={styles.brand}>
					<span className={styles.brandMark}>
						<ShieldCheck size={18} />
					</span>
					{m.app_name()}
				</div>
				<Card>
					<CardHeader>
						<CardTitle>{m.welcome_back()}</CardTitle>
						<CardDescription>{m.login_description()}</CardDescription>
					</CardHeader>
					<CardContent>
						<form className={styles.form} onSubmit={submit}>
							<div className={styles.field}>
								<Label htmlFor="email">{m.email()}</Label>
								<Input
									id="email"
									onChange={(event) => setEmail(event.target.value)}
									required
									type="email"
									value={email}
								/>
							</div>
							<div className={styles.field}>
								<Label htmlFor="password">{m.password()}</Label>
								<Input
									id="password"
									onChange={(event) => setPassword(event.target.value)}
									required
									type="password"
									value={password}
								/>
							</div>
							{error ? (
								<p className={styles.error} role="alert">
									{error}
								</p>
							) : null}
							<Button disabled={submitting} type="submit">
								{submitting ? m.signing_in() : m.sign_in()}
							</Button>
						</form>
					</CardContent>
				</Card>
			</div>
		</main>
	);
}
