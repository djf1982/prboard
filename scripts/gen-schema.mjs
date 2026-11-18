// Writes public/prboard.schema.json from the zod schema, so editors can autocomplete config files.
// Node 23.6+ runs the TypeScript schema file directly (type stripping).
import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { configSchema } from '../src/config/schema.ts';

const schema = z.toJSONSchema(configSchema, { io: 'input', unrepresentable: 'any' });
schema.title = 'prboard config';
writeFileSync(new URL('../public/prboard.schema.json', import.meta.url), JSON.stringify(schema, null, 2) + '\n');
console.log('wrote public/prboard.schema.json');
