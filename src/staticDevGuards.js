import fs from 'node:fs';
import path from 'node:path';

const ENV_PATTERN = /process\.env\.([A-Z0-9_]+)/g;
const PACKAGE_BLOAT = new Map([
  ['lodash', 'Use targeted native JavaScript APIs or small per-function packages instead of full lodash.'],
  ['moment', 'Use `date-fns`, `dayjs`, or native `Intl` APIs instead of moment.'],
  ['request', 'Use built-in `fetch` or `undici`; `request` is deprecated.']
]);

export function scanStaticDevGuardFindings({ diff, files, repoRoot = process.cwd(), prTitle = '' }) {
  return [
    ...scanConfigSync(diff, repoRoot),
    ...scanPackageBloat(diff),
    ...scanMarkdownLinks(diff),
    ...scanRiskySqlAndRegex(diff),
    ...scanSemanticTitle(prTitle)
  ];
}

export function scanConfigSync(diff, repoRoot = process.cwd()) {
  const documented = readDocumentedEnvKeys(repoRoot);
  const findings = [];

  for (const entry of addedLinesWithContext(diff)) {
    for (const match of entry.content.matchAll(ENV_PATTERN)) {
      const key = match[1];
      if (!documented.has(key)) {
        findings.push({
          path: entry.file,
          line: entry.line,
          severity: 'error',
          category: 'configuration',
          title: 'Environment variable missing from .env.example',
          body: `\`${key}\` is used in code but is not documented in \`.env.example\`. Add it to the example file before merging so deployments stay reproducible.`,
          source: 'config-sync-guard'
        });
      }
    }
  }

  return dedupe(findings);
}

export function scanPackageBloat(diff) {
  const findings = [];

  for (const entry of addedLinesWithContext(diff)) {
    if (!entry.file.endsWith('package.json')) {
      continue;
    }

    const packageMatch = entry.content.match(/"([^"]+)"\s*:\s*"([^"]+)"/);
    if (!packageMatch) {
      continue;
    }

    const [, packageName, version] = packageMatch;
    if (version.trim() === '*') {
      findings.push({
        path: entry.file,
        line: entry.line,
        severity: 'warning',
        category: 'supply-chain',
        title: 'Loose dependency wildcard',
        body: `\`${packageName}\` uses wildcard version \`*\`. Pin a safe semver range to keep builds reproducible.`,
        suggestion: entry.content.replace('"*"', '"^1.0.0"'),
        source: 'supply-chain-guard'
      });
    }

    if (PACKAGE_BLOAT.has(packageName)) {
      findings.push({
        path: entry.file,
        line: entry.line,
        severity: 'warning',
        category: 'supply-chain',
        title: 'Heavy or deprecated dependency added',
        body: `\`${packageName}\` is a known bundle or maintenance risk. ${PACKAGE_BLOAT.get(packageName)}`,
        suggestion: packageName === 'moment' ? entry.content.replace('"moment"', '"date-fns"') : null,
        source: 'supply-chain-guard'
      });
    }
  }

  return findings;
}

export function scanMarkdownLinks(diff) {
  const findings = [];
  const relativeLinkPattern = /\[.+?\]\((?!https?:\/\/|mailto:|#)(.+?)\)/g;

  for (const entry of addedLinesWithContext(diff)) {
    if (!entry.file.endsWith('.md')) {
      continue;
    }

    for (const match of entry.content.matchAll(relativeLinkPattern)) {
      const target = match[1].trim();
      if (!target || /\s/.test(target) || target.endsWith('/') || target.includes('\\')) {
        findings.push({
          path: entry.file,
          line: entry.line,
          severity: 'warning',
          category: 'documentation',
          title: 'Suspicious relative markdown link',
          body: `Relative markdown link \`${target || '(empty)'}\` looks malformed. Use a concrete relative file path or a valid anchor.`,
          source: 'markdown-link-validator'
        });
      }
    }
  }

  return findings;
}

export function scanRiskySqlAndRegex(diff) {
  const findings = [];

  for (const entry of addedLinesWithContext(diff)) {
    if (!/\.(js|ts|mjs|cjs)$/i.test(entry.file)) {
      continue;
    }

    if (/SELECT.*FROM.*WHERE.*(?:['"`]\s*\+|\$\{)/i.test(entry.content)) {
      findings.push({
        path: entry.file,
        line: entry.line,
        severity: 'critical',
        category: 'security',
        title: 'Raw SQL string construction',
        body: 'This added SQL appears to concatenate or interpolate dynamic values. Use parameterized queries to avoid SQL injection.',
        source: 'redos-sql-guard'
      });
    }

    if (hasNestedQuantifierRegex(entry.content)) {
      findings.push({
        path: entry.file,
        line: entry.line,
        severity: 'critical',
        category: 'security',
        title: 'Potential ReDoS-prone regex',
        body: 'This regex appears to contain nested quantifiers, which can cause catastrophic backtracking. Simplify it or use bounded matching.',
        source: 'redos-sql-guard'
      });
    }
  }

  return findings;
}

export function scanSemanticTitle(prTitle) {
  if (/^(feat|fix|chore|docs|refactor|test|ci|hotfix)(\([^)]+\))?:\s+\S/.test(String(prTitle || ''))) {
    return [];
  }

  return [{
    path: 'pull-request',
    line: 1,
    severity: 'warning',
    category: 'maintainability',
    title: 'PR title should use Conventional Commits',
    body: 'Use a semantic title such as `feat: add billing guard` or `fix: handle empty review queue` so release notes and changelogs stay clean.',
    source: 'semantic-title-guard',
    global: true
  }];
}

function hasNestedQuantifierRegex(line) {
  return /\/[^/\n]*(\([^)]*[+*][^)]*\)[+*]|\[[^\]]+\][+*]\{|\([^)]*\{[0-9,]+\}[^)]*\)[+*])[^/\n]*\/[gimsuy]*/.test(line);
}

function readDocumentedEnvKeys(repoRoot) {
  try {
    const envExample = fs.readFileSync(path.join(repoRoot, '.env.example'), 'utf8');
    const keys = new Set();
    for (const line of envExample.split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)\s*=/);
      if (match) {
        keys.add(match[1]);
      }
    }
    return keys;
  } catch {
    return new Set();
  }
}

function addedLinesWithContext(diff) {
  const entries = [];
  let currentFile = 'unknown';
  let newLine = 0;

  for (const rawLine of String(diff || '').split('\n')) {
    const fileMatch = rawLine.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (fileMatch) {
      currentFile = fileMatch[2];
      newLine = 0;
      continue;
    }

    const hunkMatch = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      newLine = Number(hunkMatch[1]);
      continue;
    }

    if (rawLine.startsWith('+++')) {
      continue;
    }

    if (rawLine.startsWith('+')) {
      entries.push({ file: currentFile, line: newLine || 1, content: rawLine.slice(1) });
      newLine += 1;
      continue;
    }

    if (!rawLine.startsWith('-') && !rawLine.startsWith('\\')) {
      newLine += 1;
    }
  }

  return entries;
}

function dedupe(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.path}:${finding.line}:${finding.title}:${finding.body}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
