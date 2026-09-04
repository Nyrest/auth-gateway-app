import Gmail from "@thesvg/react/gmail";
import Google from "@thesvg/react/google";
import GoogleAds from "@thesvg/react/google-ads";
import GoogleAnalytics from "@thesvg/react/google-analytics";
import GoogleBigquery from "@thesvg/react/google-bigquery";
import GoogleCalendar from "@thesvg/react/google-calendar";
import GoogleChat from "@thesvg/react/google-chat";
import GoogleCloud from "@thesvg/react/google-cloud";
import GoogleDocs from "@thesvg/react/google-docs";
import GoogleDrive from "@thesvg/react/google-drive";
import GoogleForms from "@thesvg/react/google-forms";
import GoogleGemini from "@thesvg/react/google-gemini";
import GoogleMaps from "@thesvg/react/google-maps";
import GoogleMeet from "@thesvg/react/google-meet";
import GooglePlay from "@thesvg/react/google-play";
import GoogleSearchConsole from "@thesvg/react/google-search-console";
import GoogleSheets from "@thesvg/react/google-sheets";
import GoogleSlides from "@thesvg/react/google-slides";
import GoogleTasks from "@thesvg/react/google-tasks";
import GoogleWorkspace from "@thesvg/react/google-workspace";

import { baseUrlField, stringField, testFields } from "./common";
import { createApiKeyProvider } from "./factories";
import { createOidcProvider, oauthFields } from "./oidc";
import type {
	ProviderDefinition,
	ProviderField,
	ProviderRuntimeIconDefinition,
} from "./types";

const googleAuth = {
	authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
	tokenUrl: "https://oauth2.googleapis.com/token",
} as const;

const googleScopes: Record<string, string> = {
	google_ads: "https://www.googleapis.com/auth/adwords",
	google_analytics: "https://www.googleapis.com/auth/analytics.readonly",
	google_bigquery: "https://www.googleapis.com/auth/bigquery.readonly",
	google_calendar: "https://www.googleapis.com/auth/calendar.readonly",
	google_chat: "https://www.googleapis.com/auth/chat.messages.readonly",
	google_cloud_storage: "https://www.googleapis.com/auth/devstorage.read_only",
	google_contacts: "https://www.googleapis.com/auth/contacts.readonly",
	google_docs: "https://www.googleapis.com/auth/documents.readonly",
	google_drive: "https://www.googleapis.com/auth/drive.readonly",
	google_forms: "https://www.googleapis.com/auth/forms.body.readonly",
	google_health: "https://www.googleapis.com/auth/healthdata.readonly",
	google_mail: "https://www.googleapis.com/auth/gmail.readonly",
	google_meet: "https://www.googleapis.com/auth/meetings.space.created",
	google_play: "https://www.googleapis.com/auth/androidpublisher",
	google_search_console: "https://www.googleapis.com/auth/webmasters.readonly",
	google_sheet: "https://www.googleapis.com/auth/spreadsheets.readonly",
	google_slides: "https://www.googleapis.com/auth/presentations.readonly",
	google_tasks: "https://www.googleapis.com/auth/tasks.readonly",
	google_workspace_admin:
		"https://www.googleapis.com/auth/admin.directory.user.readonly",
};

const googleBaseUrls: Record<string, string> = {
	google_ads: "https://googleads.googleapis.com",
	google_analytics: "https://analyticsdata.googleapis.com",
	google_bigquery: "https://bigquery.googleapis.com",
	google_calendar: "https://www.googleapis.com/calendar/v3",
	google_chat: "https://chat.googleapis.com",
	google_cloud_storage: "https://storage.googleapis.com",
	google_docs: "https://docs.googleapis.com",
	google_drive: "https://www.googleapis.com/drive/v3",
	google_forms: "https://forms.googleapis.com",
	google_mail: "https://gmail.googleapis.com",
	google_meet: "https://meet.googleapis.com",
	google_play: "https://androidpublisher.googleapis.com",
	google_search_console: "https://searchconsole.googleapis.com",
	google_sheet: "https://sheets.googleapis.com",
	google_slides: "https://slides.googleapis.com",
	google_tasks: "https://tasks.googleapis.com",
};

const googleIcons: Readonly<Record<string, ProviderRuntimeIconDefinition>> = {
	google: { kind: "brand", component: Google },
	google_ads: { kind: "brand", component: GoogleAds },
	google_analytics: { kind: "brand", component: GoogleAnalytics },
	google_bigquery: { kind: "brand", component: GoogleBigquery },
	google_calendar: { kind: "brand", component: GoogleCalendar },
	google_chat: { kind: "brand", component: GoogleChat },
	google_cloud_storage: { kind: "brand", component: GoogleCloud },
	google_docs: { kind: "brand", component: GoogleDocs },
	google_drive: { kind: "brand", component: GoogleDrive },
	google_forms: { kind: "brand", component: GoogleForms },
	google_mail: { kind: "brand", component: Gmail },
	google_meet: { kind: "brand", component: GoogleMeet },
	google_play: { kind: "brand", component: GooglePlay },
	google_search_console: { kind: "brand", component: GoogleSearchConsole },
	google_sheet: { kind: "brand", component: GoogleSheets },
	google_slides: { kind: "brand", component: GoogleSlides },
	google_tasks: { kind: "brand", component: GoogleTasks },
	google_workspace_admin: { kind: "brand", component: GoogleWorkspace },
	google_gemini: { kind: "brand", component: GoogleGemini },
	google_maps: { kind: "brand", component: GoogleMaps },
};

function getGoogleIcon(slug: string): ProviderRuntimeIconDefinition {
	return googleIcons[slug] ?? googleIcons.google;
}

function googleProvider(
	slug: string,
	nameKey: ProviderField["labelKey"],
	descriptionKey: ProviderField["labelKey"],
	withVerification = true,
): ProviderDefinition {
	const provider = createOidcProvider({
		slug,
		nameKey,
		descriptionKey,
		category: "predefined",
		icon: getGoogleIcon(slug),
		defaultBaseUrl: googleBaseUrls[slug] ?? "https://www.googleapis.com",
		fields: oauthFields(),
		endpoints: googleAuth,
		defaultScopes: googleScopes[slug] ?? "openid email profile",
	});
	return withVerification
		? {
				...provider,
				verification: {
					method: "GET",
					path: "https://openidconnect.googleapis.com/v1/userinfo",
				},
			}
		: provider;
}

export const googleOauth = googleProvider(
	"google_oauth",
	"providers_google_oauth_name",
	"providers_google_oauth_description",
	false,
);

const googleServiceAccount: ProviderDefinition = {
	slug: "google_service_account",
	category: "predefined",
	icon: getGoogleIcon("google"),
	defaultBaseUrl: "https://www.googleapis.com",
	protocol: "bearer",
	auth: { kind: "bearer", tokenField: "access_token" },
	capabilities: { test: true },
	metadata: {
		nameKey: "providers_google_service_account_name",
		descriptionKey: "providers_google_service_account_description",
	},
	fields: [
		baseUrlField,
		stringField("service_account_json", "provider_field_service_account_json", {
			required: true,
			secret: true,
		}),
		...testFields,
	],
	validate(input) {
		const raw = (input as { secrets?: Record<string, string> } | undefined)
			?.secrets?.service_account_json;
		if (!raw) return;
		try {
			const value = JSON.parse(raw) as Record<string, unknown>;
			if (
				typeof value.client_email !== "string" ||
				typeof value.private_key !== "string"
			)
				throw new Error();
		} catch {
			throw new Error("invalid service account");
		}
	},
};

const googleServiceProviders: readonly ProviderDefinition[] = [
	...Object.entries(googleScopes).map(([slug]) =>
		googleProvider(
			slug,
			`providers_${slug}_name` as ProviderField["labelKey"],
			`providers_${slug}_description` as ProviderField["labelKey"],
		),
	),
	{
		...googleProvider(
			"google_calendar_mcp",
			"providers_google_calendar_mcp_name",
			"providers_google_calendar_mcp_description",
			false,
		),
		defaultBaseUrl: "https://mcp.googleapis.com",
		mcp: { transport: "streamable_http", sessionMode: "stateless" },
	},
	createApiKeyProvider({
		slug: "google_gemini",
		nameKey: "providers_google_gemini_name",
		descriptionKey: "providers_google_gemini_description",
		baseUrl: "https://generativelanguage.googleapis.com",
		testPath: "/v1beta/models",
		icon: getGoogleIcon("google_gemini"),
	}),
	createApiKeyProvider({
		slug: "google_maps",
		nameKey: "providers_google_maps_name",
		descriptionKey: "providers_google_maps_description",
		baseUrl: "https://maps.googleapis.com",
		testPath: "/maps/api/geocode/json",
		icon: getGoogleIcon("google_maps"),
		location: "query",
		keyName: "key",
	}),
	googleServiceAccount,
];

export const googleProviders: readonly ProviderDefinition[] = [
	googleOauth,
	...googleServiceProviders,
];
