const VAGUE_MESSAGES = new Set(['wip', 'fix', 'update', 'changes', 'asdf', 'test', 'aaa', 'aaaa']);

export async function lintPullRequestCommits(octokit, owner, repo, pullNumber, logger = console) {
  try {
    const commits = await octokit.paginate(octokit.rest.pulls.listCommits, {
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100
    });

    return lintCommitMessages(commits);
  } catch (error) {
    logger.warn({ err: error, owner, repo, pullNumber }, 'Commit linting failed.');
    return [];
  }
}

export function lintCommitMessages(commits = []) {
  return commits
    .map((commit) => {
      const sha = (commit.sha || '').slice(0, 7);
      const message = String(commit.commit?.message || commit.message || '').split('\n')[0].trim();
      const issue = findCommitMessageIssue(message);
      return issue ? { sha, message, issue } : null;
    })
    .filter(Boolean);
}

export function buildCommitLintSection(commitIssues = []) {
  if (!commitIssues.length) {
    return '';
  }

  const rows = commitIssues
    .slice(0, 20)
    .map((commit) => `| \`${commit.sha}\` ${escapeTable(commit.message)} | ${escapeTable(commit.issue)} |`)
    .join('\n');

  return [
    `<details>`,
    `<summary>Commit message suggestions (${commitIssues.length} commits)</summary>`,
    '',
    '| Commit | Issue |',
    '|---|---|',
    rows,
    '',
    '</details>'
  ].join('\n');
}

function findCommitMessageIssue(message) {
  const lower = message.toLowerCase();
  if (message.length < 10) {
    return 'Too short - describe the actual change.';
  }
  if (message.length > 200) {
    return 'First line is over 200 characters.';
  }
  if (message.length > 72) {
    return 'First line is over 72 characters; keep it scannable.';
  }
  if (VAGUE_MESSAGES.has(lower)) {
    return 'Too vague - describe what changed.';
  }
  if (/^\d/.test(message)) {
    return 'Starts with a number; use a descriptive subject.';
  }
  if (/^[A-Z0-9\s!?.-]+$/.test(message) && /[A-Z]/.test(message)) {
    return 'All caps commit subjects are hard to scan.';
  }
  if (message.endsWith('...')) {
    return 'Avoid trailing ellipses; make the subject complete.';
  }
  if (!/^([a-z]+)(\(.+\))?:\s+\S|^[A-Z][a-zA-Z0-9]/.test(message)) {
    return 'Use a conventional lowercase type or a clear capitalized sentence.';
  }

  return null;
}

function escapeTable(value) {
  return String(value || '').replace(/\|/g, '\\|');
}
