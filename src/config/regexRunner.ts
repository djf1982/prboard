import { firstMatch } from './computed';
import type { RegexJob } from './regexWorker';

export const REGEX_TIMEOUT_MS = 750;

export class RegexTimeoutError extends Error {}

/**
 * Runs regex jobs in a Web Worker and stops the worker if it takes too long.
 * This is the last guard against a slow pattern from a shared config: the
 * page stays responsive, and the column shows an error.
 */
export async function runRegexJobs(jobs: RegexJob[], timeoutMs = REGEX_TIMEOUT_MS): Promise<(string[] | null)[][]> {
  if (!jobs.length) return [];
  if (typeof Worker === 'undefined') return jobs.map((j) => j.inputs.map((s) => firstMatch(j.pattern, s)));
  const worker = new Worker(new URL('./regexWorker.ts', import.meta.url), { type: 'module' });
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new RegexTimeoutError(`A regex took longer than ${timeoutMs} ms and was stopped.`)), timeoutMs);
      worker.onmessage = (e: MessageEvent<{ results: (string[] | null)[][] }>) => { clearTimeout(timer); resolve(e.data.results); };
      worker.onerror = (e) => { clearTimeout(timer); reject(new Error(e.message || 'Regex worker failed')); };
      worker.postMessage({ jobs });
    });
  } finally {
    worker.terminate();
  }
}
