export function buildDiffFromFiles(files = []) {
  return files.map((file) => {
    const previous = file.previous_filename || file.filename;
    const patch = file.patch || '';
    return [
      `diff --git a/${previous} b/${file.filename}`,
      `--- a/${previous}`,
      `+++ b/${file.filename}`,
      patch
    ].filter(Boolean).join('\n');
  }).join('\n');
}

export function extractChangedFilePaths(diffOrFiles) {
  if (Array.isArray(diffOrFiles)) {
    return [...new Set(diffOrFiles.map((file) => file.filename).filter(Boolean))];
  }

  const paths = [];
  for (const line of String(diffOrFiles || '').split('\n')) {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (match) {
      paths.push(match[2]);
    }
  }

  return [...new Set(paths)];
}

export function isReviewLineFinding(finding) {
  return finding?.path && Number.isInteger(Number(finding.line)) && Number(finding.line) > 0 && !finding.global;
}
