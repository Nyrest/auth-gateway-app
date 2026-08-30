import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { DiscoveryPolicy, SkillDescriptor, SkillPackage } from "./types";

type PackageJson = {
	readonly name?: unknown;
	readonly version?: unknown;
	readonly intent?: unknown;
};

const DEFAULT_EXCLUSIONS = [".cache", ".bin", "@types"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function matches(value: string, patterns: readonly string[]): boolean {
	return patterns.some(
		(pattern) =>
			value === pattern ||
			(pattern.endsWith("/") && value.startsWith(pattern)) ||
			(pattern.endsWith("*") && value.startsWith(pattern.slice(0, -1))),
	);
}

async function readJson(path: string): Promise<PackageJson | undefined> {
	try {
		const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
		return isRecord(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

type DirectoryEntry = Dirent<string>;

async function findSkillFiles(directory: string): Promise<readonly string[]> {
	const found: string[] = [];
	let entries: DirectoryEntry[];
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch {
		return found;
	}
	for (const entry of entries) {
		if (entry.name.startsWith("_")) continue;
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			const nested = await findSkillFiles(path);
			found.push(...nested);
		} else if (entry.isFile() && entry.name === "SKILL.md") {
			found.push(path);
		}
	}
	return found;
}

function parseSkillMetadata(content: string):
	| {
			readonly name: string;
			readonly description: string;
			readonly triggers: readonly string[];
	  }
	| undefined {
	const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	const frontmatter = match?.[1];
	if (!frontmatter) return undefined;
	const name = frontmatter
		.match(/^name:\s*["']?([^"'\r\n]+)["']?\s*$/m)?.[1]
		?.trim();
	const description = frontmatter
		.match(/^description:\s*["']?([^"'\r\n]+)["']?\s*$/m)?.[1]
		?.trim();
	const triggerLine = frontmatter.match(/^triggers:\s*\[([^\]]*)\]/m)?.[1];
	const triggers = triggerLine
		? triggerLine
				.split(",")
				.map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
				.filter(Boolean)
		: [];
	return name && description ? { name, description, triggers } : undefined;
}

function intentAllowsPackage(
	packageJson: PackageJson | undefined,
	packageName: string,
): boolean {
	if (!packageJson || !isRecord(packageJson.intent)) return false;
	const skills = packageJson.intent.skills;
	if (!Array.isArray(skills)) return true;
	return skills.some(
		(entry) =>
			entry === packageName ||
			(typeof entry === "string" &&
				entry.endsWith("*") &&
				packageName.startsWith(entry.slice(0, -1))),
	);
}

export async function discoverInstalledSkillPackages(
	rootDirectory: string,
	policy: DiscoveryPolicy,
): Promise<readonly SkillPackage[]> {
	const root = resolve(rootDirectory);
	const allowlist = policy.allowlist;
	const exclusions = [...DEFAULT_EXCLUSIONS, ...(policy.exclusions ?? [])];
	if (allowlist.length === 0) return [];
	const nodeModules = join(root, "node_modules");
	let entries: DirectoryEntry[];
	try {
		entries = await readdir(nodeModules, { withFileTypes: true });
	} catch {
		return [];
	}
	const packageRoots: string[] = [];
	for (const entry of entries) {
		if (
			!entry.isDirectory() ||
			entry.name.startsWith(".") ||
			matches(entry.name, exclusions)
		)
			continue;
		const entryPath = join(nodeModules, entry.name);
		if (entry.name.startsWith("@")) {
			let scoped: DirectoryEntry[];
			try {
				scoped = await readdir(entryPath, { withFileTypes: true });
			} catch {
				continue;
			}
			for (const child of scoped)
				if (child.isDirectory()) packageRoots.push(join(entryPath, child.name));
		} else packageRoots.push(entryPath);
	}
	const packages: SkillPackage[] = [];
	const maxSkillBytes = policy.maxSkillBytes ?? 128_000;
	for (const packageRoot of packageRoots) {
		const packageJson = await readJson(join(packageRoot, "package.json"));
		const packageName =
			typeof packageJson?.name === "string" ? packageJson.name : undefined;
		if (
			!packageName ||
			!matches(packageName, allowlist) ||
			matches(packageName, exclusions) ||
			!intentAllowsPackage(packageJson, packageName)
		)
			continue;
		const skillsRoot = join(packageRoot, "skills");
		const files = await findSkillFiles(skillsRoot);
		const skills: SkillDescriptor[] = [];
		for (const skillPath of files) {
			try {
				if ((await stat(skillPath)).size > maxSkillBytes) continue;
			} catch {
				continue;
			}
			const descriptor = parseSkillMetadata(
				await readFile(skillPath, "utf8").catch(() => ""),
			);
			if (!descriptor) continue;
			skills.push({
				packageName,
				packageRoot,
				skillName: descriptor.name,
				skillPath,
				description: descriptor.description,
				triggers: descriptor.triggers,
			});
		}
		const version =
			typeof packageJson?.version === "string"
				? packageJson.version
				: "unknown";
		if (skills.length > 0)
			packages.push({ packageName, packageRoot, version, skills });
	}
	return packages;
}

export function isSafeSkillPath(
	skillPath: string,
	packageRoot: string,
): boolean {
	const resolvedSkill = resolve(skillPath);
	const resolvedRoot = resolve(packageRoot);
	return (
		resolvedSkill.startsWith(`${resolvedRoot}/`) ||
		resolvedSkill.startsWith(`${resolvedRoot}\\`)
	);
}
