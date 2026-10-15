import { randomUUID } from 'node:crypto';

/**
 * Background jobs keyed by id. Used so the article can be returned right away
 * while slower work (measuring linked files) finishes in the background.
 */
export function createJobStore(ttlMs = 11 * 60 * 1000, max = 300) {
  const jobs = new Map();
  return {
    start(fn) {
      const job = { id: randomUUID(), expires: Date.now() + ttlMs, done: false, value: null };
      job.promise = Promise.resolve()
        .then(fn)
        .then(
          (value) => {
            job.value = value;
            job.done = true;
            return value;
          },
          () => {
            job.value = null;
            job.done = true;
            return null;
          }
        );
      if (jobs.size >= max) jobs.delete(jobs.keys().next().value);
      jobs.set(job.id, job);
      return job;
    },
    get(id) {
      const job = jobs.get(id);
      if (!job) return null;
      if (job.expires <= Date.now()) {
        jobs.delete(id);
        return null;
      }
      return job;
    },
    prune() {
      const now = Date.now();
      for (const [id, job] of jobs) if (job.expires <= now) jobs.delete(id);
    },
    size: () => jobs.size,
  };
}

/** Resolves with the job value, null if the job failed, or undefined if still running after `ms`. */
export function waitFor(job, ms) {
  if (job.done) return Promise.resolve(job.value);
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  return Promise.race([job.promise, timeout]).finally(() => clearTimeout(timer));
}

/** Concurrent calls with the same key share one running promise. */
export function createCoalescer() {
  const inflight = new Map();
  return (key, fn) => {
    if (inflight.has(key)) return inflight.get(key);
    const p = Promise.resolve()
      .then(fn)
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
}
