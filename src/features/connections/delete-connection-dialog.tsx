import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { deleteConnectionForUser } from "#/features/connections/connections.functions";
import type { ConnectionView } from "#/features/connections/connections.types";
import { queryKeys } from "#/lib/api";
import { m } from "#/paraglide/messages.js";

export function DeleteConnectionDialog({
	connection,
	onDeleted,
	onOpenChange,
}: {
	readonly connection?: ConnectionView;
	readonly onDeleted?: () => void;
	readonly onOpenChange: (open: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const deleteConnection = useServerFn(deleteConnectionForUser);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState(false);
	useEffect(() => {
		if (connection) setError(false);
	}, [connection]);
	if (!connection) return null;
	const target = connection;
	async function remove() {
		setPending(true);
		setError(false);
		try {
			await deleteConnection({ data: { id: target.id } });
			await queryClient.invalidateQueries({
				queryKey: queryKeys.connections.all,
			});
			await queryClient.invalidateQueries({
				queryKey: queryKeys.apiKeys.scopeOptions(),
			});
			onDeleted?.();
			onOpenChange(false);
		} catch {
			setError(true);
		} finally {
			setPending(false);
		}
	}
	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{m.delete_connection_title()}</DialogTitle>
					<DialogDescription>
						{m.delete_connection_description()}
					</DialogDescription>
				</DialogHeader>
				{error ? (
					<p className="text-sm text-destructive" role="alert">
						{m.action_failed()}
					</p>
				) : null}
				<DialogFooter>
					<Button
						onClick={() => onOpenChange(false)}
						type="button"
						variant="outline"
					>
						{m.cancel()}
					</Button>
					<Button
						disabled={pending}
						onClick={() => void remove()}
						type="button"
						variant="destructive"
					>
						{pending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}{" "}
						{pending ? m.deleting() : m.delete()}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
