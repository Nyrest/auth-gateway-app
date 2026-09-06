import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireUser } from "#/server/auth-middleware";

import { getSystemSettings, updateSystemSettings } from "./settings.server";

export const getSystemSettingsForUser = createServerFn({ method: "GET" })
	.middleware([requireUser])
	.handler(() => getSystemSettings());

export const updateSystemSettingsForUser = createServerFn({ method: "POST" })
	.middleware([requireUser])
	.validator(
		z
			.object({
				publicOrigin: z.url().max(2_048).optional(),
			})
			.strict(),
	)
	.handler(({ context, data }) => updateSystemSettings(context.userId, data));
