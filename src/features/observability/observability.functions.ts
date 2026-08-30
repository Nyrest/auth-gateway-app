import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "#/server/auth-middleware";

import {
	listAuditEvents,
	listProviderStatistics,
} from "./observability.server";

export const listAuditEventsForUser = createServerFn({ method: "GET" })
	.middleware([requireUser])
	.handler(({ context }) => listAuditEvents(context.userId));

export const listProviderStatisticsForUser = createServerFn({ method: "GET" })
	.middleware([requireUser])
	.handler(({ context }) => listProviderStatistics(context.userId));
