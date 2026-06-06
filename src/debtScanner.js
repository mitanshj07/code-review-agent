export function scanDebtFindings(diff) {
  const findings = [];

  for (const entry of addedLinesWithContext(diff)) {
    const line = entry.content;

    if (/console\.(log|dir|trace)\s*\(/.test(line)) {
      findings.push(buildFinding(entry, 'Production console call', 'Remove `console.log`, `console.dir`, or `console.trace` before merging. Use structured logging with the appropriate level instead.'));
    }

    if (/\bdebugger\b/.test(line)) {
      findings.push(buildFinding(entry, 'Debugger statement left in code', 'Remove `debugger` before merging. It can interrupt browser or Node execution in production-like environments.'));
    }

    const todoMatch = line.match(/\/\/\s*(TODO|FIXME):?\s*(.*)/i);
    if (todoMatch) {
      const note = todoMatch[2]?.trim();
      findings.push(buildFinding(
        entry,
        `${todoMatch[1].toUpperCase()} added to production code`,
        note ? `Resolve or ticket this ${todoMatch[1].toUpperCase()} before merge: ${note}` : `Resolve or ticket this ${todoMatch[1].toUpperCase()} before merge.`
      ));
    }
  }

  return findings;
}

function buildFinding(entry, title, body) {
  return {
    path: entry.file,
    line: entry.line,
    severity: 'warning',
    category: 'maintainability',
    title,
    body,
    source: 'debt-scanner'
  };
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
