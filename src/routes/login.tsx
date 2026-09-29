import { useQueryClient } from "@tanstack/react-query";
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
import { loginCredentialFields } from "#/features/auth/login-credentials";
import { clearCurrentSessionQueryCache } from "#/lib/api";
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
	const queryClient = useQueryClient();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string>();
	const [submitting, setSubmitting] = useState(false);

	async function signInWithPasskey() {
		setSubmitting(true);
		setError(undefined);
		try {
			const result = await authClient.signIn.passkey();
			if (result.error) {
				setError(m.passkey_sign_in_failed());
				return;
			}
			clearCurrentSessionQueryCache(queryClient);
			await navigate({ to: "/" });
		} catch {
			setError(m.passkey_sign_in_failed());
		} finally {
			setSubmitting(false);
		}
	}

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitting(true);
		setError(undefined);
		try {
			const result = await authClient.signIn.email({ email, password });
			if (result.error) {
				setError(m.invalid_email_or_password());
				return;
			}
			clearCurrentSessionQueryCache(queryClient);
			await navigate({ to: "/" });
		} catch {
			setError(m.sign_in_failed());
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
									autoComplete={loginCredentialFields.email.autoComplete}
									id="email"
									name={loginCredentialFields.email.name}
									onChange={(event) => setEmail(event.target.value)}
									required
									type="email"
									value={email}
								/>
							</div>
							<div className={styles.field}>
								<Label htmlFor="password">{m.password()}</Label>
								<Input
									autoComplete={loginCredentialFields.password.autoComplete}
									id="password"
									name={loginCredentialFields.password.name}
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
							<div className="relative py-1 text-center text-xs text-muted-foreground before:absolute before:inset-x-0 before:top-1/2 before:border-t before:border-border">
								<span className="relative bg-card px-2">
									{m.or_continue_with()}
								</span>
							</div>
							<Button
								disabled={submitting}
								onClick={() => void signInWithPasskey()}
								type="button"
								variant="outline"
							>
								{m.sign_in_with_passkey()}
							</Button>
						</form>
					</CardContent>
				</Card>
			</div>
		</main>
	);
}
