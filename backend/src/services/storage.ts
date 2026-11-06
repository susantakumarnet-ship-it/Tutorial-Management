import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env';
import { badRequest, notFound } from '../utils/errors';

const ROOT = path.resolve(env.UPLOAD_DIR);

/** Files are held in memory only long enough to sniff their real type before being written to disk. */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
});

const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString() === '%PDF-' },
];

/** Detects the type from the file's magic bytes - the client-supplied mimetype is never trusted. */
export function sniff(buffer: Buffer, allowed: string[]) {
  const match = SIGNATURES.find((s) => s.test(buffer));
  if (!match || !allowed.includes(match.mime)) {
    throw badRequest(`Unsupported file type. Allowed: ${allowed.join(', ')}`);
  }
  return match;
}

/** Stores a buffer under a random, unguessable key namespaced by `folder`. Returns the storage key. */
export async function saveFile(folder: 'photos' | 'documents', ownerId: string, buffer: Buffer, ext: string) {
  const key = `${folder}/${ownerId}/${crypto.randomUUID()}.${ext}`;
  const target = resolveKey(key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer);
  return key;
}

export async function deleteFile(key: string) {
  await fs.rm(resolveKey(key), { force: true });
}

/** Resolves a key to an absolute path and refuses anything that escapes the upload root. */
export function resolveKey(key: string) {
  const full = path.resolve(ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) throw notFound('File');
  return full;
}
