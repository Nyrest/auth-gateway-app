import { createFileRoute } from "@tanstack/react-router";
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

export const Route = createFileRoute("/_authenticated/settings/")({
	component: SettingsPage,
});

function SettingsPage() {
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [message, setMessage] = useState<string>();

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setMessage(undefined);
		try {
			await changePassword({ data: { currentPassword, newPassword } });
			setCurrentPassword("");
			setNewPassword("");
			setMessage("Password changed. Other sessions were revoked.");
		} catch {
			setMessage("The password could not be changed.");
		}
	}

	return (
		<>
			<PageHeader
				description="Deployment-wide settings stay intentionally compact. Password recovery is not configured for this personal installation."
				title="Settings"
			/>
			<Card className="max-w-xl">
				<CardHeader>
					<CardTitle>Change password</CardTitle>
					<CardDescription>
						Changing your password ends other active sessions.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="grid gap-4" onSubmit={submit}>
						<div className="grid gap-2">
							<Label htmlFor="current-password">Current password</Label>
							<Input
								id="current-password"
								onChange={(event) => setCurrentPassword(event.target.value)}
								required
								type="password"
								value={currentPassword}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="new-password">New password</Label>
							<Input
								id="new-password"
								minLength={15}
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
						<Button type="submit">Update password</Button>
					</form>
				</CardContent>
			</Card>
		</>
	);
}
