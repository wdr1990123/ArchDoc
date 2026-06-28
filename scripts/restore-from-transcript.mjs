import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const transcript = path.resolve(
  process.env.TRANSCRIPT ||
    "C:/Users/wdr19/.cursor/projects/d-VibeCoding-Code-ArchDoc/agent-transcripts/66ce1a3f-7c60-4a43-8a43-5d4e94fd0cee/66ce1a3f-7c60-4a43-8a43-5d4e94fd0cee.jsonl"
);

function toRel(p) {
  return p
    .replace(/\\/g, "/")
    .replace(/^d:\/VibeCoding\/Code\/ArchDoc\/?/i, "")
    .replace(/^\//, "");
}

const files = new Map();
const failedReplacements = [];

const lines = fs.readFileSync(transcript, "utf8").split("\n").filter(Boolean);

for (const line of lines) {
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    continue;
  }
  const content = obj.message?.content;
  if (!Array.isArray(content)) continue;

  for (const block of content) {
    if (block.type !== "tool_use") continue;
    const { name, input } = block;
    if (!input?.path) continue;

    const rel = toRel(input.path);

    if (name === "Write" && input.contents !== undefined) {
      files.set(rel, input.contents);
    } else if (
      name === "StrReplace" &&
      input.old_string !== undefined &&
      input.new_string !== undefined
    ) {
      const current = files.get(rel);
      if (current === undefined) {
        failedReplacements.push({ rel, reason: "no prior Write" });
        continue;
      }
      if (!current.includes(input.old_string)) {
        failedReplacements.push({ rel, reason: "old_string not found" });
        continue;
      }
      files.set(rel, current.replace(input.old_string, input.new_string));
    } else if (name === "Delete") {
      files.delete(rel);
    }
  }
}

let written = 0;
for (const [rel, contents] of files) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents, "utf8");
  written++;
}

console.log(`Restored ${written} files to ${root}`);
if (failedReplacements.length) {
  console.log(`\nFailed StrReplace (${failedReplacements.length}):`);
  for (const f of failedReplacements) {
    console.log(`  ${f.rel}: ${f.reason}`);
  }
}

console.log("\nFiles:");
for (const rel of [...files.keys()].sort()) {
  console.log(`  ${rel}`);
}
