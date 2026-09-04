import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle, ShieldAlert } from "lucide-react";
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
import { Switch } from "#/components/ui/switch";
import { changePassword } from "#/features/auth/auth.functions";
import { updateSystemSettingsForUser } from "#/features/settings/settings.functions";
import { queryKeys, systemSettingsQueryOptions } from "#/lib/api";
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
				allowPrivateNetwork: data.allowPrivateNetwork,
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
			Promise.all([
				queryClient.invalidateQueries({
					queryKey: systemSettingsQueryOptions().queryKey,
				}),
				queryClient.invalidateQueries({
					queryKey: queryKeys.connections.all,
				}),
			]),
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

	return (
		<>
			<PageHeader description={m.settings_description()} title={m.settings()} />
			<div className="grid min-w-0 max-w-5xl gap-4 lg:grid-cols-2">
				<Card className="min-w-0 lg:col-span-2">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<ShieldAlert className="size-4 text-muted-foreground" />
							{m.network_policy_title()}
						</CardTitle>
						<CardDescription>{m.network_policy_description()}</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-3">
						<div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 p-3">
							<div className="grid min-w-0 gap-1">
								<Label htmlFor="allow-private-upstreams">
									{m.allow_private_upstreams()}
								</Label>
								<p className="text-xs text-muted-foreground">
									{m.allow_private_upstreams_description()}
								</p>
							</div>
							<Switch
								checked={settings.allowPrivateNetwork}
								disabled={settingsMutation.isPending}
								id="allow-private-upstreams"
								onCheckedChange={(checked) =>
									settingsMutation.mutate({
										data: {
											allowPrivateNetwork: checked,
											...(publicOrigin.trim() ? { publicOrigin } : {}),
										},
									})
								}
							/>
						</div>
						{settingsMutation.isPending ? (
							<LoaderCircle className="size-4 animate-spin text-muted-foreground" />
						) : null}
						{settingsMutation.isError ? (
							<p className="text-sm text-destructive" role="alert">
								{m.settings_update_failed()}
							</p>
						) : null}
					</CardContent>
				</Card>
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
											allowPrivateNetwork: settings.allowPrivateNetwork,
											publicOrigin,
										},
									})
								}
							>
								{m.save_settings()}
							</Button>
						</div>
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
