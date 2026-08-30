import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { LanguageSelector } from "#/components/language-selector";
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
import { completeSetup, getSetupStatus } from "#/features/auth/auth.functions";
import { authClient } from "#/features/auth/auth-client";
import styles from "#/features/auth/auth-page.module.css";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/setup")({
	loader: () => getSetupStatus(),
	beforeLoad: async () => {
		const status = await getSetupStatus();
		if (!status.setupRequired) {
			throw redirect({ to: "/login" });
		}
	},
	component: SetupPage,
});

function SetupPage() {
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [publicOrigin, setPublicOrigin] = useState("");
	const [setupToken, setSetupToken] = useState("");
	const [error, setError] = useState<string>();
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		setPublicOrigin(window.location.origin);
	}, []);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitting(true);
		setError(undefined);
		try {
			await completeSetup({
				data: { email, name, password, publicOrigin, setupToken },
			});
			const result = await authClient.signIn.email({ email, password });
			if (result.error) {
				throw new Error(result.error.message);
			}
			await navigate({ to: "/" });
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : m.setup_failed());
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<main className={styles.page}>
			<div className={styles.panel}>
				<div className="absolute right-4 top-4">
					<LanguageSelector />
				</div>
				<div className={styles.brand}>
					<span className={styles.brandMark}>
						<ShieldCheck size={18} />
					</span>
					{m.app_name()}
				</div>
				<Card>
					<CardHeader>
						<CardTitle>{m.create_workspace()}</CardTitle>
						<CardDescription>{m.setup_description()}</CardDescription>
					</CardHeader>
					<CardContent>
						<form className={styles.form} onSubmit={submit}>
							<div className={styles.field}>
								<Label htmlFor="setup-token">{m.setup_token()}</Label>
								<Input
									id="setup-token"
									onChange={(event) => setSetupToken(event.target.value)}
									required
									type="password"
									value={setupToken}
								/>
								<p className={styles.hint}>{m.setup_token_hint()}</p>
							</div>
							<div className={styles.field}>
								<Label htmlFor="name">{m.name()}</Label>
								<Input
									id="name"
									onChange={(event) => setName(event.target.value)}
									required
									value={name}
								/>
							</div>
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
									minLength={15}
									onChange={(event) => setPassword(event.target.value)}
									required
									type="password"
									value={password}
								/>
								<p className={styles.hint}>{m.password_hint()}</p>
							</div>
							<div className={styles.field}>
								<Label htmlFor="public-origin">{m.public_origin()}</Label>
								<Input
									id="public-origin"
									onChange={(event) => setPublicOrigin(event.target.value)}
									required
									type="url"
									value={publicOrigin}
								/>
							</div>
							{error ? (
								<p className={styles.error} role="alert">
									{error}
								</p>
							) : null}
							<Button disabled={submitting} type="submit">
								{submitting ? m.creating_workspace() : m.create_workspace()}
							</Button>
						</form>
					</CardContent>
				</Card>
			</div>
		</main>
	);
}
