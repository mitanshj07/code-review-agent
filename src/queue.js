const QUEUE_KEY = 'code-review-agent:review-jobs';
const SEEN_PREFIX = 'code-review-agent:seen';

const state = {
  worker: null,
  logger: console,
  redisUrl: '',
  redisToken: '',
  localQueue: [],
  processing: false
};

export function configureQueue({ worker, logger, redisUrl, redisToken }) {
  state.worker = worker;
  state.logger = logger || console;
  state.redisUrl = (redisUrl || '').replace(/\/+$/, '');
  state.redisToken = redisToken || '';
}

export async function enqueueReview(job) {
  if (!state.worker) {
    throw new Error('Queue worker is not configured.');
  }

  const dedupeKey = `${SEEN_PREFIX}:${job.fullName}:${job.prNumber}:${job.headSha}`;

  if (hasRedis()) {
    try {
      const setResult = await redisCommand('SET', dedupeKey, '1', 'NX', 'EX', 60 * 60);
      if (setResult !== 'OK') {
        state.logger.info({ job }, 'Skipped duplicate review job.');
        return { queued: false, duplicate: true };
      }

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
  if (state.processing) {
    return;
  }

  state.processing = true;
  try {
    while (true) {
      const job = await nextJob();
      if (!job) {
        return;
      }

      try {
        await state.worker(job);
      } catch (error) {
        state.logger.error({ err: error, job }, 'Review job failed.');
      }
    }
  } finally {
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
