const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.7z',
  '.mp4',
  '.mov',
  '.avi',
  '.mp3',
  '.psd',
  '.ai',
  '.sketch'
]);

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg']);
const AVERAGE_LINE_BYTES = 80;

export function scanFileSizeFindings(files = []) {
  const findings = [];

  for (const file of files) {
    const path = file.filename || '';
    const extension = extensionFor(path);
    const addedLines = Number(file.additions || countAddedLines(file.patch || ''));
    const estimatedKb = Math.round((addedLines * AVERAGE_LINE_BYTES) / 1024);

    if (BLOCKED_EXTENSIONS.has(extension)) {
      findings.push(buildFinding({
        path,
        title: 'Binary artifact added to PR',
        body: `This PR adds \`${extension}\` content. Binary artifacts should usually be stored in git-lfs, package storage, or ignored from source control.`,
        estimatedKb
      }));
      continue;
    }

    if (estimatedKb > 500) {
      findings.push(buildFinding({
        path,
        title: 'Large file added',
        body: `Large file added (${estimatedKb}KB estimated). Consider using git-lfs for binary files over 500KB or splitting generated artifacts out of the PR.`,
        estimatedKb
      }));
      continue;
    }

    if (IMAGE_EXTENSIONS.has(extension) && estimatedKb > 100) {
      findings.push(buildFinding({
        path,
        title: 'Large image asset added',
        body: `Image asset is approximately ${estimatedKb}KB from the diff. Compress it or host it externally if it is not source-critical.`,
        estimatedKb
      }));
    }
  }

  return findings;
}

export function scanTestColocationFindings(files = []) {
  const paths = files.map((file) => file.filename || '').filter(Boolean);
  const hasTestChange = paths.some(isTestPath);
  if (hasTestChange) {
    return [];
  }

  const coreFiles = paths.filter(isCoreLogicPath);
  if (!coreFiles.length) {
    return [];
  }

  return [{
    path: coreFiles[0],
    line: 1,
    severity: 'warning',
    category: 'maintainability',
    title: 'Core logic changed without nearby tests',
    body: `This PR changes ${coreFiles.slice(0, 3).map((file) => `\`${file}\``).join(', ')} without modifying a test file. Add or update colocated tests before merging.`,
    source: 'test-colocation-guard',
    global: true
  }];
}

function buildFinding({ path, title, body, estimatedKb }) {
  return {
    path,
    line: 1,
    severity: 'warning',
    category: 'maintainability',
    title,
    body,
    estimatedKb,
    source: 'file-size-guard',
    global: true
  };
}

function countAddedLines(patch) {
  return String(patch || '')
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++')).length;
}

function extensionFor(filename) {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex === -1 ? '' : filename.slice(dotIndex).toLowerCase();
}

function isCoreLogicPath(path) {
  return /^(src|lib)\//.test(path) &&
    !isTestPath(path) &&
    /\.(js|jsx|ts|tsx|mjs|cjs|py|go|rs|java)$/i.test(path);
}

function isTestPath(path) {
  return /(^|\/)(tests?|__tests__)\//i.test(path) || /\.(test|spec)\./i.test(path);
}
