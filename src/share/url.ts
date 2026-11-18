import type { Config } from '../config/schema';
import { normaliseConfig, parseConfigValue, MAX_CONFIG_BYTES, type ParseResult } from '../config/parse';

const PREFIX = '#config=';

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream, cap: number): Promise<Uint8Array> {
  const out = new Blob([data as BlobPart]).stream().pipeThrough(stream);
  const reader = out.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > cap) { await reader.cancel(); throw new Error('Shared config is too large'); }
    chunks.push(value);
  }
  const buf = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  return buf;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Encodes a config as #config=<base64url(deflate-raw(JSON))>. */
export async function encodeConfigHash(config: Config): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(normaliseConfig(config)));
  const packed = await pipe(json, new CompressionStream('deflate-raw'), MAX_CONFIG_BYTES);
  return PREFIX + toBase64Url(packed);
}

export function hasConfigHash(hash: string): boolean {
  return hash.startsWith(PREFIX);
}

/** Decodes and validates a shared config. The size cap stops decompression bombs. */
export async function decodeConfigHash(hash: string): Promise<ParseResult> {
  if (!hasConfigHash(hash)) return { ok: false, errors: [{ path: '(link)', message: 'no #config= in the link' }] };
  try {
    const bytes = await pipe(fromBase64Url(hash.slice(PREFIX.length)), new DecompressionStream('deflate-raw'), MAX_CONFIG_BYTES);
    return parseConfigValue(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (e) {
    return { ok: false, errors: [{ path: '(link)', message: `could not read the shared config: ${(e as Error).message}` }] };
  }
}
