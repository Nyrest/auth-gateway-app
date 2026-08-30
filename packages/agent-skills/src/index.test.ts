import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { discoverInstalledSkillPackages } from "./discovery";
import { loadGuidanceForTask } from "./loader";

async function fixtureRoot(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "auth-gateway-skills-"));
	const packageRoot = join(root, "node_modules", "@fixture", "safe");
	await mkdir(join(packageRoot, "skills", "proxy"), { recursive: true });
	await writeFile(
		join(packageRoot, "package.json"),
		JSON.stringify({
			name: "@fixture/safe",
			version: "1.0.0",
			intent: { skills: ["@fixture/safe"] },
		}),
	);
	await writeFile(
		join(packageRoot, "skills", "proxy", "SKILL.md"),
		"---\nname: proxy\ndescription: streaming proxy guidance\n---\nUse a stream.\n",
	);
	return root;
}

describe("safe skill discovery", () => {
	test("is deny-by-default and reads metadata without importing packages", async () => {
		const root = await fixtureRoot();
		expect(
			await discoverInstalledSkillPackages(root, { allowlist: [] }),
		).toEqual([]);
		const packages = await discoverInstalledSkillPackages(root, {
			allowlist: ["@fixture/safe"],
		});
		expect(packages).toHaveLength(1);
		expect(
			await loadGuidanceForTask(root, {
				task: "streaming proxy",
				policy: { allowlist: ["@fixture/safe"] },
			}),
		).toHaveLength(1);
	});
});
