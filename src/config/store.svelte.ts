import { DEFAULT_CONFIG } from './defaults';
import { parseConfigText, serialiseConfig, type ConfigError } from './parse';
import type { Config, ViewConfig } from './schema';
import { KEYS, read, writeTo } from '../auth/storage';

export type ConfigSource =
  | { kind: 'default' }
  | { kind: 'local' }
  | { kind: 'file'; name: string }
  | { kind: 'url' }
  | { kind: 'repo'; name: string };

export function describeSource(s: ConfigSource): string {
  switch (s.kind) {
    case 'default': return 'built-in default';
    case 'local': return 'saved in this browser';
    case 'file': return `file ${s.name}`;
    case 'url': return 'shared link';
    case 'repo': return `repo ${s.name}`;
  }
}

/**
 * Holds the active config. UI changes (sort, resize, hide, reorder, group)
 * go through update(), so the file and the UI never disagree.
 */
export class ConfigStore {
  config = $state<Config>(structuredClone(DEFAULT_CONFIG));
  source = $state<ConfigSource>({ kind: 'default' });
  /** True when the active config has changes that are not saved in this browser. */
  unsaved = $state(false);
  loadErrors = $state<ConfigError[]>([]);

  constructor() {
    const saved = read(KEYS.config);
    if (saved) {
      const res = parseConfigText(saved.value);
      if (res.ok) { this.config = res.config; this.source = { kind: 'local' }; }
      else this.loadErrors = res.errors;
    }
  }

  /** Makes a parsed config active. Configs from a link, file or repo are not saved until the user says so. */
  replace(config: Config, source: ConfigSource): void {
    this.config = config;
    this.source = source;
    this.unsaved = source.kind !== 'local' && source.kind !== 'default';
    if (source.kind === 'local') this.save();
  }

  update(mutator: (draft: Config) => void): void {
    const draft = $state.snapshot(this.config) as Config;
    mutator(draft);
    this.config = draft;
    this.save();
  }

  updateView(name: string, mutator: (view: ViewConfig) => void): void {
    this.update((c) => { const v = c.views.find((x) => x.name === name); if (v) mutator(v); });
  }

  save(): void {
    writeTo('local', KEYS.config, serialiseConfig($state.snapshot(this.config) as Config));
    this.unsaved = false;
    this.source = { kind: 'local' };
  }

  resetToDefault(): void {
    this.config = structuredClone(DEFAULT_CONFIG);
    this.source = { kind: 'default' };
    this.save();
  }
}
