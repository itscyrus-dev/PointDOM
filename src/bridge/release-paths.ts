import {
  lstatSync,
  readlinkSync,
  readFileSync,
  writeFileSync,
  realpathSync,
  existsSync,
  mkdtempSync,
  symlinkSync,
  renameSync,
  rmSync,
  cpSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Release layouts only. Source checkouts and extracted archives stay independent. */
export function releasePaths(entryUrl: string) {
  const entry = fileURLToPath(entryUrl);
  const bridge = dirname(entry);
  if (basename(bridge) !== 'bridge' || basename(dirname(bridge)) !== 'dist') return null;
  const release = realpathSync(resolve(bridge, '../..'));
  const versions = dirname(release);
  if (basename(versions) !== 'versions') return null;
  const base = dirname(versions);
  return {
    release,
    versions,
    base,
    current: join(base, 'current'),
    extension: join(base, 'PointDOM Extension'),
  };
}
type Paths = NonNullable<ReturnType<typeof releasePaths>>;
const markerName = '.pointdom-managed.json';
const markerSchema = z.object({ format: z.literal(1), source: z.string() }).strict();
const isExtension = (target: string, paths: Paths) =>
  dirname(resolve(target, '../..')) === paths.versions && target.endsWith('/dist/extension');
function stat(path: string) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}
function managedExtension(paths: Paths) {
  const existing = stat(paths.extension);
  if (!existing) return undefined;
  if (existing.isSymbolicLink()) {
    if (isExtension(resolve(paths.base, readlinkSync(paths.extension)), paths)) return undefined; // Legacy alias, migrated on the next setup/update.
  } else if (existing.isDirectory()) {
    try {
      const marker = markerSchema.parse(
        JSON.parse(readFileSync(join(paths.extension, markerName), 'utf8')),
      );
      if (isExtension(marker.source, paths)) return marker.source;
    } catch {
      /* An unmarked or invalid directory is never ours to replace. */
    }
  }
  throw new Error(
    'PointDOM Extension already exists as an unrelated shortcut, regular file or folder. Rename it before installing PointDOM.',
  );
}

function stageExtension(paths: Paths, source: string) {
  const installed = managedExtension(paths);
  if (installed === source) return { commit() {}, rollback() {} };
  const temp = mkdtempSync(join(paths.base, '.extension-'));
  const next = join(temp, 'next'),
    previous = join(temp, 'previous');
  let backedUp = false;
  try {
    cpSync(source, next, { recursive: true });
    writeFileSync(join(next, markerName), JSON.stringify({ format: 1, source }), { mode: 0o600 });
    if (stat(paths.extension)) {
      renameSync(paths.extension, previous);
      backedUp = true;
    }
    renameSync(next, paths.extension);
  } catch (error) {
    if (backedUp) renameSync(previous, paths.extension);
    rmSync(temp, { recursive: true, force: true });
    throw error;
  }
  return {
    commit() {
      // Cleanup is not part of activation; a leftover temporary backup must not undo a ready release.
      try {
        rmSync(temp, { recursive: true, force: true });
      } catch {
        /* Safe to clean up later. */
      }
    },
    rollback() {
      rmSync(paths.extension, { recursive: true, force: true });
      if (backedUp) renameSync(previous, paths.extension);
      rmSync(temp, { recursive: true, force: true });
    },
  };
}

export function fixedExtensionDirectory(entryUrl: string, source: string, prepare: boolean) {
  const paths = releasePaths(entryUrl);
  if (!paths) return source;
  const installed = managedExtension(paths);
  if (!prepare) return installed === source ? paths.extension : source;
  stageExtension(paths, source).commit();
  return paths.extension;
}

/** Preflight must run before registering or replacing a background service. */
export function validateRelease(entryUrl: string) {
  const paths = releasePaths(entryUrl);
  if (!paths) return;
  const source = join(paths.release, 'dist/extension');
  if (
    !existsSync(join(paths.release, 'dist/bridge/mcp.js')) ||
    !existsSync(join(source, 'manifest.json'))
  )
    throw new Error('Incomplete release. Fixed entries were not changed.');
  const current = stat(paths.current);
  if (
    current &&
    (!current.isSymbolicLink() ||
      dirname(resolve(paths.base, readlinkSync(paths.current))) !== paths.versions)
  )
    throw new Error(
      'current already exists as an unrelated shortcut, regular file or folder. Rename it before installing PointDOM.',
    );
  managedExtension(paths);
  return paths;
}

/** Switch fixed browser/MCP entries only after the new service has reported ready. */
export function activateRelease(entryUrl: string) {
  const paths = validateRelease(entryUrl);
  if (!paths) return;
  const source = join(paths.release, 'dist/extension');
  const temp = mkdtempSync(join(paths.base, '.activate-'));
  let extension: ReturnType<typeof stageExtension> | undefined;
  try {
    extension = stageExtension(paths, source);
    symlinkSync(paths.release, join(temp, 'current'), 'dir');
    renameSync(join(temp, 'current'), paths.current);
  } catch (error) {
    extension?.rollback();
    throw error;
  } finally {
    try {
      rmSync(temp, { recursive: true, force: true });
    } catch {
      /* Activation has its own rollback; keep only a temporary link on cleanup failure. */
    }
  }
  extension.commit();
}

export function stableMcpEntry(entryUrl: string) {
  const entry = fileURLToPath(entryUrl);
  const paths = releasePaths(entryUrl);
  if (!paths) return entry;
  const current = join(paths.current, 'dist/bridge/mcp.js');
  // Export fixed paths only after this release has been successfully activated.
  if (existsSync(current) && realpathSync(paths.current) === paths.release) return current;
  return entry;
}
