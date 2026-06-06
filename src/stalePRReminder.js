import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import cron from 'node-cron';
import { redis } from './queue.js';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_COMMENTS_PER_RUN = 5;

export function startStalePRReminder(config, logger = console) {
  if (process.env.DISABLE_STALE_PR_REMINDER === 'true') {
    logger.info('[Stale] Reminder cron disabled by env.');
    return null;
  }

  const task = cron.schedule('0 10 * * *', () => {
    void runStalePRReminder(config, logger);
  }, {
    timezone: 'UTC'
  });

  logger.info('[Stale] Reminder cron scheduled for 10:00 UTC daily.');
  return task;
}

export async function runStalePRReminder(config, logger = console) {
  let commentsPosted = 0;

  try {
    const appOctokit = await createAppClient(config);
    const installations = await appOctokit.paginate(appOctokit.rest.apps.listInstallations, {
      per_page: 100
    });

    for (const installation of installations) {
      if (commentsPosted >= MAX_COMMENTS_PER_RUN) {
        break;
      }

      const octokit = await createInstallationClient(config, installation.id);
      const repos = await octokit.paginate(octokit.rest.apps.listReposAccessibleToInstallation, {
        per_page: 100
      });

      for (const repoInfo of repos) {
        if (commentsPosted >= MAX_COMMENTS_PER_RUN) {
          break;
        }

        const [owner, repo] = repoInfo.full_name.split('/');
        const pulls = await octokit.paginate(octokit.rest.pulls.list, {
          owner,
          repo,
          state: 'open',
          per_page: 20
        });

        for (const pr of pulls) {
          if (commentsPosted >= MAX_COMMENTS_PER_RUN) {
            break;
          }
          if (!isStaleWithoutRequestedReview(pr)) {
            continue;
          }

          const key = `stale-reminded:${owner}/${repo}/${pr.number}`;
          if (await redis.get(key)) {
            continue;
          }

          const ageDays = Math.max(3, Math.floor((Date.now() - new Date(pr.updated_at).getTime()) / (24 * 60 * 60 * 1000)));
          await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: pr.number,
            body: [
              '## Gentle reminder',
              '',
              `This PR has been open for **${ageDays} days** without activity.`,
              '',
              'Does it still need review, or can it be closed?',
              `/cc @${pr.user?.login || 'author'}`
            ].join('\n')
          });
          await redis.setex(key, 3 * 24 * 60 * 60, new Date().toISOString());
          commentsPosted += 1;
          logger.info(`[Stale] Reminded PR #${pr.number} in ${owner}/${repo}`);
        }
      }
    }
  } catch (error) {
    logger.warn({ err: error }, '[Stale] Reminder run failed.');
  }

  return { commentsPosted };
}

async function createAppClient(config) {
  const auth = createAppAuth({
    appId: config.githubAppId,
    privateKey: config.githubPrivateKey
  });
  const appAuth = await auth({ type: 'app' });
  return new Octokit({ auth: appAuth.token });
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

function isStaleWithoutRequestedReview(pr) {
  const updatedAt = new Date(pr.updated_at).getTime();
  const stale = Date.now() - updatedAt > THREE_DAYS_MS;
  const requestedReviewers = pr.requested_reviewers || [];
  const requestedTeams = pr.requested_teams || [];
  return stale && requestedReviewers.length === 0 && requestedTeams.length === 0;
}
