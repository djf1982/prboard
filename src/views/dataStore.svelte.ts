import type { Client } from '../github/client';
import { GitHubError } from '../github/client';
import type { RateLimit } from '../github/types';
import { searchPullRequests } from '../github/search';
import type { Config } from '../config/schema';
import { configFragments, viewCost, type Row } from './columns';
import { computeColumns } from './computeColumns';

/** Warn when a view that uses expensive fields returns more than this. */
export const HIGH_COST_WARN_AT = 300;

export interface ViewData {
  rows: Row[];
  total: number;
  truncated: boolean;
  errors: string[];
  error: string | null;
  fetchedAt: number | null;
  cost: number;
}

const emptyView = (): ViewData => ({ rows: [], total: 0, truncated: false, errors: [], error: null, fetchedAt: null, cost: 0 });

/**
 * Fetches every view once per cycle, caches by view name, polls on an
 * interval and pauses while the tab is hidden. PRs that show up in several
 * views share one Row object.
 */
export class DataStore {
  views = $state<Record<string, ViewData>>({});
  rateLimit = $state<RateLimit | null>(null);
  loading = $state(false);
  lastUpdated = $state<number | null>(null);
  fatal = $state<string | null>(null);
  paused = $state(false);

  #timer: ReturnType<typeof setInterval> | null = null;
  #run = 0;
  #onVisibility = () => this.#visibilityChanged();

  constructor(
    private readonly getClient: () => Client | null,
    private readonly getConfig: () => Config,
  ) {}

  view(name: string): ViewData {
    return this.views[name] ?? emptyView();
  }

  async refresh(): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    const config = this.getConfig();
    const run = ++this.#run;
    this.loading = true;
    this.fatal = null;
    const fragments = configFragments(config);
    const byQuery = new Map<string, Promise<Awaited<ReturnType<typeof searchPullRequests>>>>();
    const rowsById = new Map<string, Row>();
    const next: Record<string, ViewData> = {};
    try {
      for (const view of config.views) {
        const pageSize = viewCost(view) === 'high' ? 50 : 100;
        const key = view.query.trim();
        if (!byQuery.has(key)) byQuery.set(key, searchPullRequests(client, view.query, fragments, { pageSize }));
      }
      for (const view of config.views) {
        try {
          const res = await byQuery.get(view.query.trim())!;
          if (res.rateLimit) this.rateLimit = res.rateLimit;
          const rows = res.nodes.map((pr) => {
            let row = rowsById.get(pr.id);
            if (!row) { row = { pr, denied: res.denied.get(pr.id) ?? new Set(), computed: new Map() }; rowsById.set(pr.id, row); }
            return row;
          });
          const errors = [...res.errors];
          if (res.truncated)
            errors.unshift(`GitHub found ${res.total.toLocaleString()} results but search returns at most 1,000. Showing ${res.nodes.length}. Narrow the query to see the rest.`);
          if (viewCost(view) === 'high' && res.total > HIGH_COST_WARN_AT)
            errors.push(`This view uses expensive fields (checks or review threads) on ${res.total.toLocaleString()} results. It uses a lot of rate limit.`);
          next[view.name] = { rows, total: res.total, truncated: res.truncated, errors, error: null, fetchedAt: Date.now(), cost: res.cost };
        } catch (e) {
          if (e instanceof GitHubError && (e.kind === 'auth' || e.kind === 'rate-limit')) throw e;
          next[view.name] = { ...this.view(view.name), error: (e as Error).message };
        }
      }
      const computeErrors = await computeColumns(config.views, [...rowsById.values()]);
      if (computeErrors.length) for (const v of Object.values(next)) v.errors.push(...computeErrors);
      if (run !== this.#run) return; // a newer refresh started
      this.views = next;
      this.lastUpdated = Date.now();
    } catch (e) {
      if (run === this.#run) this.fatal = (e as Error).message;
    } finally {
      if (run === this.#run) this.loading = false;
    }
  }

  start(): void {
    this.stop();
    document.addEventListener('visibilitychange', this.#onVisibility);
    void this.refresh();
    this.#schedule();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    document.removeEventListener('visibilitychange', this.#onVisibility);
  }

  /** Restarts the poll timer, for example after refreshSeconds changes. */
  reschedule(): void {
    if (this.#timer) this.#schedule();
  }

  #schedule() {
    if (this.#timer) clearInterval(this.#timer);
    const ms = Math.max(30, this.getConfig().refreshSeconds) * 1000;
    this.#timer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.refresh();
    }, ms);
  }

  #visibilityChanged() {
    this.paused = document.visibilityState !== 'visible';
    if (!this.paused && this.lastUpdated && Date.now() - this.lastUpdated > this.getConfig().refreshSeconds * 1000) void this.refresh();
  }
}
