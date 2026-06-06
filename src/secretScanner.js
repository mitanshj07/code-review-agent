const SECRET_PATTERNS = [
  ['AWS Access Key', /AKIA[0-9A-Z]{16}/g],
  ['AWS Secret Key', /aws_secret.*=\s*['"][0-9a-zA-Z/+=]{40}['"]/gi],
  ['GitHub Token', /ghp_[a-zA-Z0-9]{36}/g],
  ['GitHub OAuth Token', /gho_[a-zA-Z0-9]{36}/g],
  ['GitHub App Token', /ghs_[a-zA-Z0-9]{36}/g],
  ['Slack Token', /xox[baprs]-[0-9a-zA-Z-]{10,48}/g],
  ['Stripe Live Key', /sk_live_[0-9a-zA-Z]{24}/g],
  ['Stripe Publishable Key', /pk_live_[0-9a-zA-Z]{24}/g],
  ['Twilio SID', /AC[0-9a-f]{32}/g],
  ['Twilio Token', /SK[0-9a-f]{32}/g],
  ['SendGrid Key', /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g],
  ['Google API Key', /AIza[0-9A-Za-z-_]{35}/g],
  ['Firebase URL', /[a-z0-9-]+\.firebaseio\.com/g],
  ['Private Key Block', /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g],
  ['Generic password', /password\s*=\s*['"][^'"]{6,}['"]/gi],
  ['Generic secret', /secret\s*=\s*['"][^'"]{6,}['"]/gi],
  ['Generic API key', /api_key\s*=\s*['"][^'"]{8,}['"]/gi],
  ['Generic token', /token\s*=\s*['"][^'"]{8,}['"]/gi],
  ['Basic Auth in URL', /https?:\/\/[^:]+:[^@]+@[a-zA-Z0-9.-]+/g],
  ['Hardcoded JWT', /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g]
];

const EXAMPLE_TERMS = ['example', 'placeholder', 'your-key-here', 'xxx', '123456', 'test'];

export function scanForSecrets(diff) {
  const findings = [];
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
      const content = rawLine.slice(1);
      if (!isSkippableExampleComment(content)) {
        findings.push(...scanAddedLine(content, {
          file: currentFile,
          line: newLine || 1
        }));
      }
      newLine += 1;
      continue;
    }

    if (!rawLine.startsWith('-') && !rawLine.startsWith('\\')) {
      newLine += 1;
    }
  }

  return dedupeFindings(findings);
}

export function redactedSecretTable(secretFindings) {
  return secretFindings.map((finding) => ({
    type: finding.pattern,
    location: `${finding.path || 'unknown'}:${finding.line}`,
    match: finding.match
  }));
}

function scanAddedLine(content, location) {
  const findings = [];

  for (const [pattern, regex] of SECRET_PATTERNS) {
    const matcher = new RegExp(regex.source, regex.flags);
    for (const match of content.matchAll(matcher)) {
      findings.push({
        pattern,
        match: redact(match[0]),
        line: location.line,
        path: location.file,
        severity: 'critical',
        category: 'security',
        title: `${pattern} exposed`,
        body: `This added line appears to contain a hardcoded credential (${pattern}). Remove it from the PR, rotate the credential immediately, and use an environment variable or secret manager instead.`,
        source: 'secret-scanner'
      });
    }
  }

  return findings;
}

function redact(value) {
  const text = String(value || '');
  if (text.length <= 8) {
    return `${text.slice(0, 2)}***${text.slice(-2)}`;
  }

  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

function isSkippableExampleComment(content) {
  const trimmed = content.trim().toLowerCase();
  const isComment = trimmed.startsWith('//') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('<!--');

  return isComment && EXAMPLE_TERMS.some((term) => trimmed.includes(term));
}

function dedupeFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.path}:${finding.line}:${finding.pattern}:${finding.match}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
