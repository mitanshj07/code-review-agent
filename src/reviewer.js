import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import Groq from 'groq-sdk';

const REVIEWABLE_EXTENSIONS = new Set([
  '.c',
  '.cc',
  '.cpp',
  '.cs',
  '.css',
  '.go',
  '.java',
  '.js',
  '.jsx',
  '.json',
  '.kt',
  '.mjs',
  '.php',
  '.py',
  '.rb',
  '.rs',
  '.sh',
  '.sql',
  '.swift',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml'
]);

export async function reviewPullRequest(job, config, logger) {
  const octokit = await createInstallationClient(config, job.installationId);
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner: job.owner,
    repo: job.repo,
    pull_number: job.prNumber,
    per_page: 100
  });

  const reviewableFiles = files
    .filter((file) => isReviewableFile(file))
    .slice(0, config.maxFiles);

  const findings = [];
  for (const file of reviewableFiles) {
    const addedLines = parseAddedLines(file.patch || '');
    if (addedLines.length === 0) {
      continue;
    }

    findings.push(...runDeterministicChecks(file.filename, addedLines, file.patch || ''));

    const aiFindings = await reviewFileWithGroq(file, addedLines, config, logger);
    findings.push(...aiFindings);
  }

  const dedupedFindings = dedupeFindings(findings).slice(0, config.maxComments);

  return {
    headSha: job.headSha,
    totalFiles: files.length,
    filesReviewed: reviewableFiles.length,
    findings: dedupedFindings,
    summary: buildSummary(job, dedupedFindings, reviewableFiles.length, files.length)
  };
}

async function createInstallationClient(config, installationId) {
  const auth = createAppAuth({
    appId: config.githubAppId,
    privateKey: config.githubPrivateKey,
    installationId
  });

  const installationAuth = await auth({ type: 'installation' });
  return new Octokit({ auth: installationAuth.token });
}

function isReviewableFile(file) {
  if (!['added', 'modified', 'renamed'].includes(file.status)) {
    return false;
  }

  if (!file.patch || file.patch.length > 80_000) {
    return false;
  }

  const lower = file.filename.toLowerCase();
  if (lower.includes('package-lock.json') || lower.includes('pnpm-lock.yaml') || lower.includes('yarn.lock')) {
    return false;
  }

  return REVIEWABLE_EXTENSIONS.has(extensionFor(file.filename));
}

function extensionFor(filename) {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex === -1 ? '' : filename.slice(dotIndex).toLowerCase();
}

export function parseAddedLines(patch) {
  const added = [];
  let newLine = 0;

  for (const rawLine of patch.split('\n')) {
    const hunk = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }

    if (rawLine.startsWith('+++')) {
      continue;
    }

    if (rawLine.startsWith('+')) {
      added.push({ line: newLine, content: rawLine.slice(1) });
      newLine += 1;
      continue;
    }

    if (!rawLine.startsWith('-')) {
      newLine += 1;
    }
  }

  return added.filter((entry) => Number.isInteger(entry.line) && entry.line > 0);
}

function runDeterministicChecks(path, addedLines, patch) {
  const findings = [];
  const patchText = patch.toLowerCase();
  const hasTryOrCatch = /\btry\b|\bcatch\b|\.catch\s*\(/.test(patchText);

  for (const { line, content } of addedLines) {
    const trimmed = content.trim();

    if (/\bconsole\.(log|debug|trace)\s*\(/.test(trimmed)) {
      findings.push({
        path,
        line,
        severity: 'low',
        title: 'Remove debug logging',
        body: 'This debug log can leak request data or create noisy production logs. Use structured logging with an appropriate level, or remove it before merging.',
        suggestion: '',
        source: 'static'
      });
    }

    if (looksLikeHardcodedSecret(trimmed)) {
      findings.push({
        path,
        line,
        severity: 'high',
        title: 'Hardcoded secret detected',
        body: 'This line appears to hardcode a credential or token. Move it to a secret manager or environment variable and rotate the exposed value.',
        suggestion: buildSecretSuggestion(content),
        source: 'static'
      });
    }

    if (looksLikeSqlInjection(trimmed)) {
      findings.push({
        path,
        line,
        severity: 'critical',
        title: 'Possible SQL injection',
        body: 'This query appears to concatenate or interpolate untrusted data into SQL. Use parameterized queries or prepared statements instead.',
        suggestion: buildSqlSuggestion(content),
        source: 'static'
      });
    }

    if (looksLikeMissingAwait(trimmed)) {
      findings.push({
        path,
        line,
        severity: 'medium',
        title: 'Async result is not awaited',
        body: 'This async call appears to be assigned or executed without `await` or an explicit returned promise. The code may continue before the operation finishes.',
        suggestion: buildAwaitSuggestion(content),
        source: 'static'
      });
    }

    if (!hasTryOrCatch && /\basync\s+(function\s+)?\w*|\)\s*=>\s*\{/.test(trimmed)) {
      findings.push({
        path,
        line,
        severity: 'medium',
        title: 'Missing error handling around async work',
        body: 'This async control flow does not add visible error handling in the changed code. Add `try/catch`, return errors to the caller, or centralize failure handling.',
        source: 'static'
      });
    }
  }

  return findings;
}

function looksLikeHardcodedSecret(line) {
  const namedSecret = /\b(api[_-]?key|access[_-]?token|auth[_-]?token|secret|password|private[_-]?key)\b\s*[:=]\s*['"`][A-Za-z0-9_./=:+-]{12,}['"`]/i;
  const providerToken = /['"`](gsk_[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})['"`]/;
  return namedSecret.test(line) || providerToken.test(line);
}

function looksLikeSqlInjection(line) {
  const sqlVerb = /\b(SELECT|INSERT|UPDATE|DELETE)\b/i;
  const interpolation = /(\$\{[^}]+}|['"`]\s*\+\s*[\w.()[\]]+|[\w.()[\]]+\s*\+\s*['"`])/;
  const queryCall = /\b(query|execute|raw|prepare)\s*\(/i;
  return sqlVerb.test(line) && (interpolation.test(line) || (queryCall.test(line) && /`/.test(line)));
}

function looksLikeMissingAwait(line) {
  if (/\b(await|return|void)\b/.test(line)) {
    return false;
  }

  const asyncCall = /\b(fetch|axios\.\w+|db\.query|pool\.query|client\.query|connection\.query|prisma\.\w+\.\w+|sendEmail|save|findOne|findMany)\s*\(/;
  return asyncCall.test(line) && /^(const|let|var)\s+\w+\s*=|;\s*$/.test(line);
}

function buildAwaitSuggestion(line) {
  if (/\bawait\b/.test(line)) {
    return null;
  }

  if (/=\s*/.test(line)) {
    return line.replace(/=\s*/, '= await ');
  }

  return line.replace(/^(\s*)/, '$1await ');
}

function buildSecretSuggestion(line) {
  const declaration = line.match(/^(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*)['"`][^'"`]+['"`](.*)$/);
  if (declaration) {
    return `${declaration[1]}process.env.${toEnvName(declaration[2])}${declaration[3]}`;
  }

  const property = line.match(/^(\s*['"]?([A-Za-z_$][\w$-]*)['"]?\s*:\s*)['"`][^'"`]+['"`](.*)$/);
  if (property) {
    return `${property[1]}process.env.${toEnvName(property[2])}${property[3]}`;
  }

  return null;
}

function buildSqlSuggestion(line) {
  if (!/`/.test(line) || !/\$\{[^}]+}/.test(line)) {
    return null;
  }

  const parameterized = line.replace(/\$\{[^}]+}/g, '?');
  return parameterized === line ? null : `${parameterized} // Pass the dynamic values as query parameters.`;
}

function toEnvName(name) {
  const normalized = String(name || 'SECRET')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

  return normalized || 'SECRET';
}

async function reviewFileWithGroq(file, addedLines, config, logger) {
  if (!config.groqApiKey) {
    return [];
  }

  const allowedLines = new Set(addedLines.map((entry) => entry.line));
  const groq = new Groq({ apiKey: config.groqApiKey });

  const prompt = {
    file: file.filename,
    added_lines: addedLines.slice(0, 250),
    diff: (file.patch || '').slice(0, 24_000)
  };

  try {
    const completion = await groq.chat.completions.create({
      model: config.groqModel,
      temperature: 0.1,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are a senior code review agent for GitHub pull requests.',
            'Find only actionable correctness, security, reliability, or maintainability issues in added lines.',
            'Do not comment on style-only issues. Do not invent context outside the diff.',
            'Return valid JSON only with shape {"findings":[{"line":number,"severity":"critical|high|medium|low","title":string,"body":string,"suggestion":string|null}]}',
            'When a safe one-line fix is obvious, set suggestion to the exact replacement text for that changed line without markdown fences. Otherwise use null.',
            'Every line must be one of the provided added_lines line numbers.'
          ].join(' ')
        },
        {
          role: 'user',
          content: JSON.stringify(prompt)
        }
      ]
    });

    const text = completion.choices?.[0]?.message?.content || '{"findings":[]}';
    const parsed = parseJsonObject(text);
    const findings = Array.isArray(parsed.findings) ? parsed.findings : [];

    return findings
      .filter((finding) => allowedLines.has(Number(finding.line)))
      .slice(0, 6)
      .map((finding) => ({
        path: file.filename,
        line: Number(finding.line),
        severity: normalizeSeverity(finding.severity),
        title: cleanText(finding.title, 'Review finding'),
        body: cleanText(finding.body, 'Please review this changed line.'),
        suggestion: cleanSuggestion(finding.suggestion),
        source: 'groq'
      }));
  } catch (error) {
    logger.warn({ err: error, file: file.filename }, 'Groq review failed for file; continuing with static findings.');
    return [];
  }
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { findings: [] };
  }
}

function normalizeSeverity(severity) {
  return ['critical', 'high', 'medium', 'low'].includes(severity) ? severity : 'medium';
}

function cleanText(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 900) : fallback;
}

function cleanSuggestion(value) {
  if (typeof value !== 'string') {
    return null;
  }

  return value
    .replace(/^```(?:suggestion|[\w-]+)?\s*/i, '')
    .replace(/```$/i, '')
    .slice(0, 1600);
}

function dedupeFindings(findings) {
  const seen = new Set();
  const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };

  return findings
    .filter((finding) => finding.path && finding.line && finding.body)
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
    .filter((finding) => {
      const key = `${finding.path}:${finding.line}:${finding.title.toLowerCase()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function buildSummary(job, findings, filesReviewed, totalFiles) {
  if (findings.length === 0) {
    return `Code Review Agent checked ${filesReviewed} of ${totalFiles} changed file(s) in #${job.prNumber} and did not find high-confidence issues.`;
  }

  const counts = findings.reduce((memo, finding) => {
    memo[finding.severity] = (memo[finding.severity] || 0) + 1;
    return memo;
  }, {});

  const severitySummary = ['critical', 'high', 'medium', 'low']
    .filter((severity) => counts[severity])
    .map((severity) => `${counts[severity]} ${severity}`)
    .join(', ');

  return `Code Review Agent found ${findings.length} issue(s) across ${filesReviewed} of ${totalFiles} changed file(s): ${severitySummary}.`;
}
