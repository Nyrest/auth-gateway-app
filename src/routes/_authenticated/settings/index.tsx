import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type FormEvent, useState } from "react";

import { PageHeader } from "#/components/layout/app-shell";
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
import { changePassword } from "#/features/auth/auth.functions";
import { authClient } from "#/features/auth/auth-client";
import { updateSystemSettingsForUser } from "#/features/settings/settings.functions";
import { systemSettingsQueryOptions } from "#/lib/api";
import { m } from "#/paraglide/messages.js";

export const Route = createFileRoute("/_authenticated/settings/")({
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(systemSettingsQueryOptions()),
	component: SettingsPage,
});

function SettingsPage() {
	const queryClient = useQueryClient();
	const settingsQuery = useSuspenseQuery(systemSettingsQueryOptions());
	const settings = settingsQuery.data;
	const updateSystemSettings = useServerFn(updateSystemSettingsForUser);
	const changePasswordRequest = useServerFn(changePassword);
	const passkeysQuery = authClient.useListPasskeys();
	const [passkeyName, setPasskeyName] = useState("");
	const [passkeyMessage, setPasskeyMessage] = useState<string>();
	const [passkeyError, setPasskeyError] = useState(false);
	const [registeringPasskey, setRegisteringPasskey] = useState(false);
	const [deletingPasskeyId, setDeletingPasskeyId] = useState<string>();
	const [publicOrigin, setPublicOrigin] = useState(settings.publicOrigin ?? "");
	const settingsMutation = useMutation({
		mutationFn: updateSystemSettings,
		onMutate: async ({ data }) => {
			await queryClient.cancelQueries({
				queryKey: systemSettingsQueryOptions().queryKey,
			});
			const previous = queryClient.getQueryData(
				systemSettingsQueryOptions().queryKey,
			);
			queryClient.setQueryData(systemSettingsQueryOptions().queryKey, {
				publicOrigin: data.publicOrigin ?? settings.publicOrigin,
			});
			return { previous };
		},
		onError: (_error, _variables, context) => {
			if (context?.previous) {
				queryClient.setQueryData(
					systemSettingsQueryOptions().queryKey,
					context.previous,
				);
			}
		},
		onSettled: () =>
			queryClient.invalidateQueries({
				queryKey: systemSettingsQueryOptions().queryKey,
			}),
	});
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [message, setMessage] = useState<string>();

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setMessage(undefined);
		try {
			await changePasswordRequest({ data: { currentPassword, newPassword } });
			setCurrentPassword("");
			setNewPassword("");
			setMessage(m.password_changed());
		} catch {
			setMessage(m.password_change_failed());
		}
	}

	async function registerPasskey(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPasskeyMessage(undefined);
		setPasskeyError(false);
		setRegisteringPasskey(true);
		try {
			const result = await authClient.passkey.addPasskey({
				name: passkeyName.trim() || undefined,
			});
			if (result.error) {
				setPasskeyError(true);
				setPasskeyMessage(m.passkey_registration_failed());
				return;
			}
			setPasskeyName("");
			setPasskeyMessage(m.passkey_registered());
			await passkeysQuery.refetch();
		} catch {
			setPasskeyError(true);
			setPasskeyMessage(m.passkey_registration_failed());
		} finally {
			setRegisteringPasskey(false);
		}
	}

	async function deletePasskey(id: string) {
		setPasskeyMessage(undefined);
		setPasskeyError(false);
		setDeletingPasskeyId(id);
		try {
			const result = await authClient.passkey.deletePasskey({ id });
			if (result.error) {
				setPasskeyError(true);
				setPasskeyMessage(m.passkey_delete_failed());
				return;
			}
			setPasskeyMessage(m.passkey_deleted());
			await passkeysQuery.refetch();
		} catch {
			setPasskeyError(true);
			setPasskeyMessage(m.passkey_delete_failed());
		} finally {
			setDeletingPasskeyId(undefined);
		}
	}

	return (
		<>
			<PageHeader description={m.settings_description()} title={m.settings()} />
			<div className="grid min-w-0 max-w-5xl gap-4 lg:grid-cols-2">
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>{m.public_origin_settings()}</CardTitle>
						<CardDescription>
							{m.public_origin_settings_description()}
						</CardDescription>
					</CardHeader>
					<CardContent className="grid min-w-0 gap-2">
						<Label htmlFor="public-origin-settings">
							{m.public_origin_settings()}
						</Label>
						<Input
							id="public-origin-settings"
							onChange={(event) => setPublicOrigin(event.target.value)}
							type="url"
							value={publicOrigin}
						/>
						<div className="flex justify-end pt-2">
							<Button
								disabled={settingsMutation.isPending || !publicOrigin.trim()}
								onClick={() =>
									settingsMutation.mutate({
										data: {
											publicOrigin,
										},
									})
								}
							>
								{m.save_settings()}
							</Button>
						</div>
						{settingsMutation.isError ? (
							<p className="text-sm text-destructive" role="alert">
								{m.settings_update_failed()}
							</p>
						) : null}
					</CardContent>
				</Card>
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>{m.passkeys()}</CardTitle>
						<CardDescription>{m.passkeys_description()}</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4">
						<form className="grid gap-3" onSubmit={registerPasskey}>
							<div className="grid gap-2">
								<Label htmlFor="passkey-name">{m.passkey_name()}</Label>
								<Input
									id="passkey-name"
									onChange={(event) => setPasskeyName(event.target.value)}
									placeholder={m.passkey_name_placeholder()}
									value={passkeyName}
								/>
							</div>
							<div className="flex justify-end">
								<Button disabled={registeringPasskey} type="submit">
									{registeringPasskey
										? m.registering_passkey()
										: m.register_passkey()}
								</Button>
							</div>
						</form>
						{passkeyMessage ? (
							<p
								className={
									passkeyError
										? "text-sm text-destructive"
										: "text-sm text-muted-foreground"
								}
								role={passkeyError ? "alert" : undefined}
							>
								{passkeyMessage}
							</p>
						) : null}
						{passkeysQuery.isPending ? (
							<p className="text-sm text-muted-foreground">{m.loading()}</p>
						) : passkeysQuery.error ? (
							<p className="text-sm text-destructive" role="alert">
								{m.passkeys_load_failed()}
							</p>
						) : passkeysQuery.data?.length ? (
							<ul className="grid gap-2">
								{passkeysQuery.data.map((passkey) => (
									<li
										className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
										key={passkey.id}
									>
										<span className="min-w-0 truncate text-sm">
											{passkey.name || m.passkey_default_name()}
										</span>
										<Button
											disabled={deletingPasskeyId === passkey.id}
											onClick={() => void deletePasskey(passkey.id)}
											size="sm"
											variant="destructive"
										>
											{deletingPasskeyId === passkey.id
												? m.deleting()
												: m.delete()}
										</Button>
									</li>
								))}
							</ul>
						) : (
							<p className="text-sm text-muted-foreground">{m.no_passkeys()}</p>
						)}
					</CardContent>
				</Card>
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>{m.change_password()}</CardTitle>
						<CardDescription>{m.change_password_description()}</CardDescription>
					</CardHeader>
					<CardContent>
						<form className="grid gap-4" onSubmit={submit}>
							<div className="grid gap-2">
								<Label htmlFor="current-password">{m.current_password()}</Label>
								<Input
									id="current-password"
									onChange={(event) => setCurrentPassword(event.target.value)}
									required
									type="password"
									value={currentPassword}
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="new-password">{m.new_password()}</Label>
								<Input
									id="new-password"
									minLength={8}
									onChange={(event) => setNewPassword(event.target.value)}
									required
									type="password"
									value={newPassword}
								/>
							</div>
							{message ? (
								<output className="text-sm text-muted-foreground">
									{message}
								</output>
							) : null}
							<div className="flex justify-end">
								<Button type="submit">{m.update_password()}</Button>
							</div>
						</form>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
