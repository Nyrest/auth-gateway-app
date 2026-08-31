import { z } from "zod";

export const setupSchema = z
	.object({
		name: z.string().trim().min(1).max(100),
		email: z.email().max(320),
		password: z.string().min(8).max(128),
		publicOrigin: z.url().max(2_048),
	})
	.strict();

export const changePasswordSchema = z
	.object({
		currentPassword: z.string().min(1),
		newPassword: z.string().min(8).max(128),
	})
	.strict();
