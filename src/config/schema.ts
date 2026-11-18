// This file imports only zod, so scripts/gen-schema.mjs can load it with plain Node.
import { z } from 'zod';

export const CURRENT_VERSION = 1;

const id = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'must start with a letter and use only letters, digits, _ or -');

export const columnObjectSchema = z
  .strictObject({
    id: id.describe('A field id from the registry, or a new id for a computed column.'),
    label: z.string().max(100).optional().describe('Column header. Defaults to the field label.'),
    width: z.number().int().min(40).max(2000).optional().describe('Column width in pixels.'),
    hidden: z.boolean().optional().describe('Keep the column in the config but do not show or fetch it.'),
    from: id.optional().describe('Computed columns: the field to read from.'),
    regex: z.string().min(1).max(200).optional().describe('Computed columns: show the first match.'),
    link: z.string().max(500).optional().describe('Computed columns with regex: https link template. $0–$9 insert match groups.'),
    prefix: z.string().min(1).max(100).optional().describe('Computed columns: show list items that start with this prefix, prefix removed.'),
  })
  .superRefine((c, ctx) => {
    const computedKeys = (['regex', 'link', 'prefix'] as const).filter((k) => c[k] !== undefined);
    if (c.from === undefined) {
      for (const k of computedKeys) ctx.addIssue({ code: 'custom', path: [k], message: `'${k}' needs 'from' (it is only for computed columns)` });
      return;
    }
    if ((c.regex === undefined) === (c.prefix === undefined))
      ctx.addIssue({ code: 'custom', message: "a computed column needs exactly one of 'regex' or 'prefix'" });
    if (c.link !== undefined && c.regex === undefined)
      ctx.addIssue({ code: 'custom', path: ['link'], message: "'link' needs 'regex'" });
  });

export const columnSchema = z.union([id, columnObjectSchema]);

export const sortSchema = z.strictObject({
  field: id,
  dir: z.enum(['asc', 'desc']).default('asc'),
});

export const viewSchema = z.strictObject({
  name: z.string().min(1).max(60),
  query: z.string().min(1).max(1000).describe('GitHub search query. is:pr is added if missing.'),
  groupBy: id.optional(),
  sort: z.array(sortSchema).max(5).default([]),
  columns: z.array(columnSchema).min(1).max(50),
});

export const configSchema = z.strictObject({
  $schema: z.string().optional(),
  version: z.literal(CURRENT_VERSION),
  refreshSeconds: z.number().int().min(30).max(3600).default(120),
  views: z.array(viewSchema).min(1).max(30),
});

export type ColumnObject = z.infer<typeof columnObjectSchema>;
export type ColumnEntry = z.infer<typeof columnSchema>;
export type SortEntry = z.infer<typeof sortSchema>;
export type ViewConfig = z.infer<typeof viewSchema>;
export type Config = z.infer<typeof configSchema>;
