/// <reference lib="webworker" />
import { firstMatch } from './computed';

export interface RegexJob { pattern: string; inputs: string[] }

self.onmessage = (e: MessageEvent<{ jobs: RegexJob[] }>) => {
  const results = e.data.jobs.map((job) => job.inputs.map((input) => firstMatch(job.pattern, input)));
  (self as unknown as Worker).postMessage({ results });
};
