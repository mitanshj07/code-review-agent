const RISK_FILE_PATTERN = /(auth|login|password|security|payment|billing|admin|config|env|secret|key|token)/i;

const SIZE_LABELS = [
  ['XS', 50, 'Tiny change, easy review'],
  ['S', 200, 'Small PR, straightforward'],
  ['M', 500, 'Medium PR, normal review'],
  ['L', 1000, 'Large PR, review carefully'],
  ['XL', Infinity, 'Massive PR - consider splitting']
];

export function analyzePRSize(diff) {
  const fileMap = new Map();
  let currentFile = null;

  for (const rawLine of String(diff || '').split('\n')) {
    const fileMatch = rawLine.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (fileMatch) {
      currentFile = fileMatch[2];
      if (!fileMap.has(currentFile)) {
        fileMap.set(currentFile, { file: currentFile, added: 0, removed: 0 });
      }
      continue;
    }

    if (!currentFile) {
      continue;
    }

    if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
      fileMap.get(currentFile).added += 1;
      continue;
    }

    if (rawLine.startsWith('-') && !rawLine.startsWith('---')) {
      fileMap.get(currentFile).removed += 1;
    }
  }

  const fileBreakdown = [...fileMap.values()];
  const totalFilesChanged = fileBreakdown.length;
  const totalLinesAdded = fileBreakdown.reduce((sum, file) => sum + file.added, 0);
  const totalLinesRemoved = fileBreakdown.reduce((sum, file) => sum + file.removed, 0);
  const totalChurn = totalLinesAdded + totalLinesRemoved;
  const [size, , sizeLabel] = SIZE_LABELS.find(([, threshold]) => totalChurn < threshold);
  const largestFile = [...fileBreakdown]
    .sort((a, b) => (b.added + b.removed) - (a.added + a.removed))[0] || { file: 'none', added: 0, removed: 0 };

  const base = Math.min(totalChurn / 20, 50);
  const fileScore = Math.min(totalFilesChanged * 3, 30);
  const riskScore = Math.min(
    fileBreakdown.filter((file) => RISK_FILE_PATTERN.test(file.file)).length * 5,
    20
  );
  const complexityScore = Math.round(Math.min(base + fileScore + riskScore, 100));

  return {
    size,
    sizeLabel,
    totalFilesChanged,
    totalLinesAdded,
    totalLinesRemoved,
    totalChurn,
    complexityScore,
    fileBreakdown,
    largestFile,
    shouldBlock: totalChurn > 2000
  };
}

export function buildTooLargePRComment(sizeData) {
  const largestFiles = [...sizeData.fileBreakdown]
    .sort((a, b) => (b.added + b.removed) - (a.added + a.removed))
    .slice(0, 3)
    .map((file) => `- \`${file.file}\` (${file.added + file.removed} changed lines)`)
    .join('\n') || '- None';

  return [
    '## PR Too Large to Auto-Review',
    '',
    `This PR has **${sizeData.totalChurn} line changes** across **${sizeData.totalFilesChanged} files**.`,
    'Automated review works best on focused PRs under 2000 lines.',
    '',
    '**Recommendation:** Split this PR into smaller logical chunks.',
    '',
    '| Metric | Value |',
    '|---|---|',
    `| Files changed | ${sizeData.totalFilesChanged} |`,
    `| Lines added | ${sizeData.totalLinesAdded} |`,
    `| Lines removed | ${sizeData.totalLinesRemoved} |`,
    `| Complexity score | ${sizeData.complexityScore}/100 |`,
    '',
    'The top 3 largest files:',
    largestFiles,
    '',
    '*Auto-review skipped to preserve API rate limits.*'
  ].join('\n');
}

export function buildPRSizeCard(sizeData) {
  const advice = sizeAdvice(sizeData.size);

  return [
    '## PR at a glance',
    '',
    `**Size:** ${sizeData.size} - ${sizeData.sizeLabel} · **Complexity:** ${sizeData.complexityScore}/100`,
    '',
    '|  |  |',
    '|---|---|',
    `| Files changed | ${sizeData.totalFilesChanged} |`,
    `| Lines added | +${sizeData.totalLinesAdded} |`,
    `| Lines removed | -${sizeData.totalLinesRemoved} |`,
    `| Riskiest file | ${sizeData.largestFile.file} |`,
    '',
    advice
  ].join('\n');
}

function sizeAdvice(size) {
  if (size === 'XL') {
    return 'Consider splitting into smaller PRs so reviewers can reason about each change safely.';
  }
  if (size === 'L') {
    return 'Large PR: prioritize tests, risky paths, and reviewer focus before merging.';
  }
  if (size === 'XS' || size === 'S') {
    return 'Focused change: ideal size for fast automated and human review.';
  }
  return 'Normal review size: CodeScope will focus on the highest-risk changed lines.';
}
