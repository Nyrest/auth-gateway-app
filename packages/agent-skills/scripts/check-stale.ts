import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = join(packageRoot, "skills");
const statePath = join(skillsRoot, "sync-state.json");

async function skillFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== "_artifacts") result.push(...(await skillFiles(path)));
    else if (entry.isFile() && entry.name === "SKILL.md") result.push(path);
  }
  return result;
}

function sources(content: string): string[] {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  return [...frontmatter.matchAll(/^\s*-\s+([^\r\n]+)$/gm)].map((match) => match[1]?.trim().replace(/^['"]|['"]$/g, "")).filter((value): value is string => Boolean(value));
}

function hash(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

const state = JSON.parse(await readFile(statePath, "utf8")) as { skills?: Record<string, { sources_sha?: Record<string, string> }> };
const failures: string[] = [];
for (const skillPath of await skillFiles(skillsRoot)) {
  const skillName = relative(skillsRoot, dirname(skillPath)).replaceAll("\\", "/");
  const recorded = state.skills?.[skillName]?.sources_sha ?? {};
  const content = await readFile(skillPath, "utf8");
  for (const source of sources(content)) {
    const sourcePath = resolve(packageRoot, source);
    if (!sourcePath.startsWith(`${packageRoot}/`) && !sourcePath.startsWith(`${packageRoot}\\`)) {
      failures.push(`${skillName}: source escapes package (${source})`);
      continue;
    }
    try {
      const current = hash(await readFile(sourcePath));
      if (recorded[source] !== current) failures.push(`${skillName}: source changed or is unsynced (${source})`);
    } catch {
      failures.push(`${skillName}: source is missing (${source})`);
    }
  }
}
if (failures.length > 0) {
  console.error(["Intent source staleness detected:", ...failures.map((failure) => `- ${failure}`), "Update the skill and skills/sync-state.json before publishing."].join("\n"));
  process.exitCode = 1;
} else {
  console.log("All referenced Agent Skill sources are current.");
}
