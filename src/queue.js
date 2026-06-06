const QUEUE_KEY = 'code-review-agent:review-jobs';
const SEEN_PREFIX = 'code-review-agent:seen';

const state = {
  handlers: {},
  logger: console,
  redisUrl: '',
  redisToken: '',
  localQueue: [],
  processing: false,
  concurrency: 1,
  activeJobs: 0
};

export function configureQueue({ handlers, worker, logger, redisUrl, redisToken, concurrency = 1 }) {
  state.handlers = handlers || { pull_request_review: worker };
  state.logger = logger || console;
  state.redisUrl = (redisUrl || '').replace(/\/+$/, '');
  state.redisToken = redisToken || '';
  state.concurrency = 1;

  if (concurrency !== 1) {
    state.logger.warn({ requestedConcurrency: concurrency }, 'Queue concurrency is pinned to 1 to protect free-tier API rate limits.');
  }
}

export async function enqueueReview(job) {
  return enqueueJob('pull_request_review', job, {
    dedupeKey: `${SEEN_PREFIX}:pull_request_review:${job.fullName}:${job.prNumber}:${job.headSha}`,
    dedupeTtlSeconds: 60 * 60
  });
}

export async function enqueueConversationalReply(job) {
  return enqueueJob('conversational_reply', job, {
    dedupeKey: `${SEEN_PREFIX}:conversational_reply:${job.fullName}:${job.prNumber}:${job.commentId}`,
    dedupeTtlSeconds: 60 * 30
  });
}

export async function enqueueJob(name, data, options = {}) {
  if (!state.handlers[name]) {
    throw new Error('Queue worker is not configured.');
  }

  const job = {
    name,
    data,
    enqueuedAt: new Date().toISOString()
  };

  if (hasRedis() && options.dedupeKey) {
    try {
      const setResult = await redisCommand('SET', options.dedupeKey, '1', 'NX', 'EX', options.dedupeTtlSeconds || 60 * 60);
      if (setResult !== 'OK') {
        state.logger.info({ job }, 'Skipped duplicate queue job.');
        return { queued: false, duplicate: true };
      }
    } catch (error) {
      state.logger.warn({ err: error }, 'Redis queue unavailable; falling back to in-memory queue.');
      state.localQueue.push(job);
      void drainQueue();
      return { queued: true, duplicate: false, fallback: true };
    }
  }

  if (hasRedis()) {
    try {
      await redisCommand('LPUSH', QUEUE_KEY, JSON.stringify(job));
      void drainQueue();
      return { queued: true, duplicate: false };
    } catch (error) {
      state.logger.warn({ err: error }, 'Redis queue unavailable; falling back to in-memory queue.');
    }
  }

  state.localQueue.push(job);
  void drainQueue();
  return { queued: true, duplicate: false };
}

export async function drainQueue() {
  if (state.processing || state.activeJobs >= state.concurrency) {
    return;
  }

  state.processing = true;
  state.activeJobs += 1;
  try {
    while (true) {
      const job = await nextJob();
      if (!job) {
        return;
      }

      try {
        const normalizedJob = normalizeJob(job);
        const handler = state.handlers[normalizedJob.name];
        if (!handler) {
          state.logger.warn({ job: normalizedJob }, 'Skipped queue job with no registered handler.');
          continue;
        }

        await handler(normalizedJob.data);
      } catch (error) {
        state.logger.error({ err: error, job }, 'Review job failed.');
      }
    }
  } finally {
    state.activeJobs -= 1;
    state.processing = false;
  }
}

export async function closeQueue() {
  await drainQueue();
}

function hasRedis() {
  return Boolean(state.redisUrl && state.redisToken);
}

async function nextJob() {
  if (hasRedis()) {
    try {
      const raw = await redisCommand('RPOP', QUEUE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      state.logger.warn({ err: error }, 'Could not read from Redis queue.');
      return null;
    }
  }

  return state.localQueue.shift() || null;
}

function normalizeJob(job) {
  if (job?.name && job?.data) {
    return job;
  }

  return {
    name: 'pull_request_review',
    data: job
  };
}

async function redisCommand(command, ...args) {
  const response = await fetch(state.redisUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${state.redisToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([command, ...args])
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Upstash Redis ${command} failed with ${response.status}: ${body}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(`Upstash Redis ${command} failed: ${payload.error}`);
  }

  return payload.result;
}
