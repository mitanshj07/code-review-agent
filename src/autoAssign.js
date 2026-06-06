const LOOKBACK_DAYS = 90;
const MAX_FILES_TO_SCORE = 10;

export async function assignReviewers(octokit, owner, repo, pullNumber, prAuthor, changedFiles, logger = console) {
  const candidates = new Map();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  for (const filePath of changedFiles.slice(0, MAX_FILES_TO_SCORE)) {
    try {
      const response = await octokit.rest.repos.listCommits({
        owner,
        repo,
        path: filePath,
        since,
        per_page: 10
      });

      for (const commit of response.data || []) {
        const username = commit.author?.login || commit.committer?.login;
        if (!isEligibleReviewer(username, prAuthor)) {
          continue;
        }

        const score = scoreCommit(commit.commit?.committer?.date || commit.commit?.author?.date);
        const current = candidates.get(username) || {
          username,
          score: 0,
          files: new Set(),
          recentCommits: 0
        };

        current.score += score;
        current.recentCommits += 1;
        current.files.add(filePath);
        candidates.set(username, current);
      }
    } catch (error) {
      logger.warn({ err: error, owner, repo, filePath }, 'Could not score reviewer history for file.');
    }
  }

  let topReviewers = [...candidates.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  if (topReviewers.length < 1) {
    topReviewers = await fallbackCollaborators(octokit, owner, repo, prAuthor, logger);
  }

  if (topReviewers.length < 1) {
    return { assigned: false, reason: 'no_reviewers_found' };
  }

  try {
    await octokit.rest.pulls.requestReviewers({
      owner,
      repo,
      pull_number: pullNumber,
      reviewers: topReviewers.map((reviewer) => reviewer.username)
    });
  } catch (error) {
    logger.warn({ err: error, owner, repo, pullNumber }, 'Could not request reviewers; skipping auto-assignment.');
    return { assigned: false, reason: 'request_reviewers_failed' };
  }

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: pullNumber,
    body: buildReviewerComment(topReviewers)
  });

  return {
    assigned: true,
    reviewers: topReviewers.map((reviewer) => reviewer.username)
  };
}

function scoreCommit(dateValue) {
  const ageMs = Date.now() - new Date(dateValue || 0).getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  if (ageDays <= 7) {
    return 3;
  }
  if (ageDays <= 30) {
    return 2;
  }
  return 1;
}

async function fallbackCollaborators(octokit, owner, repo, prAuthor, logger) {
  try {
    const response = await octokit.rest.repos.listCollaborators({
      owner,
      repo,
      per_page: 5
    });

    return (response.data || [])
      .map((collaborator) => collaborator.login)
      .filter((username) => isEligibleReviewer(username, prAuthor))
      .slice(0, 2)
      .map((username) => ({
        username,
        score: 1,
        files: new Set(['repository']),
        recentCommits: 0
      }));
  } catch (error) {
    logger.warn({ err: error, owner, repo }, 'Could not list collaborators for reviewer fallback.');
    return [];
  }
}

function isEligibleReviewer(username, prAuthor) {
  if (!username) {
    return false;
  }

  const normalized = username.toLowerCase();
  return normalized !== String(prAuthor || '').toLowerCase() && !normalized.includes('[bot]');
}

function buildReviewerComment(reviewers) {
  const rows = reviewers.map((reviewer) => {
    const files = [...reviewer.files].slice(0, 4).join(', ');
    return `| @${reviewer.username} | ${files || 'repository'} | ${reviewer.recentCommits} recent commits |`;
  }).join('\n');

  return [
    '## Reviewers auto-assigned',
    '',
    'Based on recent commit history for the changed files:',
    '',
    '| Reviewer | Files they know | Recent commits |',
    '|---|---|---|',
    rows,
    '',
    '*Assignment based on last 90 days of commit history.*'
  ].join('\n');
}
