import { readFile, stat } from "node:fs/promises";

import { discoverInstalledSkillPackages, isSafeSkillPath } from "./discovery";
import type { Guidance, GuidanceRequest, SkillDescriptor } from "./types";

function scoreSkill(skill: SkillDescriptor, task: string): number {
	const haystack =
		`${skill.skillName} ${skill.description} ${skill.triggers.join(" ")}`.toLowerCase();
	const words = task
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word.length > 2);
	return words.reduce(
		(score, word) => score + (haystack.includes(word) ? 1 : 0),
		0,
	);
}

export async function loadGuidanceForTask(
	rootDirectory: string,
	request: GuidanceRequest,
): Promise<readonly Guidance[]> {
	const packages = await discoverInstalledSkillPackages(
		rootDirectory,
		request.policy,
	);
	const candidates = packages
		.flatMap((pkg) => pkg.skills)
		.map((skill) => ({ skill, score: scoreSkill(skill, request.task) }))
		.filter((entry) => entry.score > 0)
		.sort(
			(a, b) =>
				b.score - a.score || a.skill.skillName.localeCompare(b.skill.skillName),
		);
	const maxSkills = request.maxSkills ?? 3;
	const maxBytes = request.policy.maxSkillBytes ?? 128_000;
	const result: Guidance[] = [];
	for (const { skill } of candidates.slice(0, maxSkills)) {
		const pkg = packages.find((item) => item.packageName === skill.packageName);
		if (!pkg || !isSafeSkillPath(skill.skillPath, pkg.packageRoot)) continue;
		try {
			if ((await stat(skill.skillPath)).size > maxBytes) continue;
			const content = await readFile(skill.skillPath, "utf8");
			if (Buffer.byteLength(content, "utf8") > maxBytes) continue;
			result.push({ ...skill, content });
		} catch {}
	}
	return result;
}
