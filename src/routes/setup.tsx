import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
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
import { completeSetup, getSetupStatus } from "#/features/auth/auth.functions";
import { authClient } from "#/features/auth/auth-client";
import styles from "#/features/auth/auth-page.module.css";
import { setupSchema } from "#/features/auth/auth-validation";
import {
	getSetupFieldErrors,
	getSetupFormError,
	type SetupField,
	type SetupFieldErrors,
} from "#/features/auth/setup-errors";
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
	const completeSetupRequest = useServerFn(completeSetup);
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [publicOrigin, setPublicOrigin] = useState("");
	const [fieldErrors, setFieldErrors] = useState<SetupFieldErrors>({});
	const [formError, setFormError] = useState<string>();
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		setPublicOrigin(window.location.origin);
	}, []);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSubmitting(true);
		setFieldErrors({});
		setFormError(undefined);

		const validation = setupSchema.safeParse({
			email,
			name,
			password,
			publicOrigin,
		});
		if (!validation.success) {
			setFieldErrors(getSetupFieldErrors(validation.error));
			setSubmitting(false);
			return;
		}

		try {
			await completeSetupRequest({
				data: { email, name, password, publicOrigin },
			});
			const result = await authClient.signIn.email({ email, password });
			if (result.error) {
				throw new Error(m.sign_in_failed());
			}
			await navigate({ to: "/" });
		} catch (caught) {
			const nextFieldErrors = getSetupFieldErrors(caught);
			if (Object.keys(nextFieldErrors).length > 0) {
				setFieldErrors(nextFieldErrors);
			} else {
				setFormError(getSetupFormError(caught) ?? m.setup_failed());
			}
		} finally {
			setSubmitting(false);
		}
	}

	function clearFieldError(field: SetupField) {
		setFieldErrors((current) => {
			if (!current[field]) return current;
			const next = { ...current };
			delete next[field];
			return next;
		});
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
						<CardTitle>{m.create_workspace()}</CardTitle>
						<CardDescription>{m.setup_description()}</CardDescription>
					</CardHeader>
					<CardContent>
						<form className={styles.form} noValidate onSubmit={submit}>
							<div className={styles.field}>
								<Label htmlFor="name">{m.name()}</Label>
								<Input
									aria-describedby={fieldErrors.name ? "name-error" : undefined}
									aria-invalid={Boolean(fieldErrors.name)}
									id="name"
									onChange={(event) => {
										setName(event.target.value);
										clearFieldError("name");
									}}
									required
									value={name}
								/>
								{fieldErrors.name ? (
									<p className={styles.fieldError} id="name-error" role="alert">
										{fieldErrors.name}
									</p>
								) : null}
							</div>
							<div className={styles.field}>
								<Label htmlFor="email">{m.email()}</Label>
								<Input
									aria-describedby={
										fieldErrors.email ? "email-error" : undefined
									}
									aria-invalid={Boolean(fieldErrors.email)}
									id="email"
									onChange={(event) => {
										setEmail(event.target.value);
										clearFieldError("email");
									}}
									required
									type="email"
									value={email}
								/>
								{fieldErrors.email ? (
									<p
										className={styles.fieldError}
										id="email-error"
										role="alert"
									>
										{fieldErrors.email}
									</p>
								) : null}
							</div>
							<div className={styles.field}>
								<Label htmlFor="password">{m.password()}</Label>
								<Input
									aria-describedby={
										fieldErrors.password ? "password-error" : undefined
									}
									aria-invalid={Boolean(fieldErrors.password)}
									id="password"
									minLength={8}
									onChange={(event) => {
										setPassword(event.target.value);
										clearFieldError("password");
									}}
									required
									type="password"
									value={password}
								/>
								{fieldErrors.password ? (
									<p
										className={styles.fieldError}
										id="password-error"
										role="alert"
									>
										{fieldErrors.password}
									</p>
								) : null}
							</div>
							<div className={styles.field}>
								<Label htmlFor="public-origin">{m.public_origin()}</Label>
								<Input
									aria-describedby={
										fieldErrors.publicOrigin ? "public-origin-error" : undefined
									}
									aria-invalid={Boolean(fieldErrors.publicOrigin)}
									id="public-origin"
									onChange={(event) => {
										setPublicOrigin(event.target.value);
										clearFieldError("publicOrigin");
									}}
									required
									type="url"
									value={publicOrigin}
								/>
								{fieldErrors.publicOrigin ? (
									<p
										className={styles.fieldError}
										id="public-origin-error"
										role="alert"
									>
										{fieldErrors.publicOrigin}
									</p>
								) : null}
							</div>
							{formError ? (
								<p className={styles.error} role="alert">
									{formError}
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
