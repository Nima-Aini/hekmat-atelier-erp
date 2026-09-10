import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const patterns = [
  { name: "private-key", regex: /-----BEGIN (?:OPENSSH|RSA|EC|DSA) PRIVATE KEY-----/g },
  { name: "aws-access-key", regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { name: "github-token", regex: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { name: "google-api-key", regex: /\bAIza[A-Za-z0-9_-]{30,}\b/g },
  { name: "openai-style-key", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "known-default-admin", regex: /\badmin123456\b/g },
  { name: "neshan-literal", regex: /(?:LEGACY_)?NESHAN(?:_API)?_KEY\s*[:=]\s*["']([^"'\r\n]{16,})["']/gi },
];

const fingerprint = (value) => createHash("sha256").update(value).digest("hex").slice(0, 12);
const tracked = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\0").filter(Boolean);
const currentFindings = [];

for (const file of tracked) {
  if (file === "scripts/secret-scan.mjs") continue;
  let content;
  try { content = readFileSync(file, "utf8"); } catch { continue; }
  if (content.includes("\0")) continue;
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    for (const match of content.matchAll(pattern.regex)) {
      const value = match[1] || match[0];
      currentFindings.push({ file, type: pattern.name, fingerprint: fingerprint(value) });
    }
  }
}

for (const finding of currentFindings) {
  console.error(`secret.current file=${finding.file} type=${finding.type} fingerprint=${finding.fingerprint}`);
}
if (currentFindings.length) process.exitCode = 1;
else console.log("secret.current=clean");

if (process.argv.includes("--history")) {
  const history = execFileSync("git", ["log", "--all", "-p", "--no-color", "--format=commit:%H", "--", ".", ":!package-lock.json"], { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });
  let commit = "unknown";
  let file = "unknown";
  const findings = new Map();
  for (const line of history.split("\n")) {
    if (line.startsWith("commit:")) { commit = line.slice(7, 19); continue; }
    if (line.startsWith("+++ b/")) { file = line.slice(6); continue; }
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      for (const match of line.slice(1).matchAll(pattern.regex)) {
        const value = match[1] || match[0];
        const key = `${commit}:${file}:${pattern.name}:${fingerprint(value)}`;
        findings.set(key, { commit, file, type: pattern.name, fingerprint: fingerprint(value) });
      }
    }
  }
  if (!findings.size) console.log("secret.history=no-high-confidence-match");
  for (const finding of findings.values()) {
    console.warn(`secret.history_warning commit=${finding.commit} file=${finding.file} type=${finding.type} fingerprint=${finding.fingerprint}`);
  }
  if (findings.size) console.warn("secret.history_action=external-rotation-required; history rewrite requires explicit approval");
}
