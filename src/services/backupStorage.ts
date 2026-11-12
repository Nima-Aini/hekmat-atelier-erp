import { chmod, mkdir, open, readFile, rename, stat, statfs, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { ApiError } from "@/lib/apiError";

const BACKUP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertBackupId(id: unknown): asserts id is string {
  if (typeof id !== "string" || !BACKUP_ID.test(id)) throw new ApiError(400, "شناسه نسخه پشتیبان معتبر نیست.", "INVALID_BACKUP_ID");
}

export interface BackupStorage {
  driver: "local";
  preflight(requiredBytes: number): Promise<{ availableBytes: number }>;
  createTemporary(id: string): Promise<{ path: string; handle: Awaited<ReturnType<typeof open>> }>;
  commit(id: string, temporaryPath: string): Promise<string>;
  writeMetadata(id: string, metadata: unknown): Promise<void>;
  resolve(id: string): Promise<string>;
  readMetadata(id: string): Promise<unknown>;
  remove(id: string): Promise<void>;
}

export class LocalBackupStorage implements BackupStorage {
  readonly driver = "local" as const;
  constructor(private readonly root: string) {
    if (!path.isAbsolute(root)) throw new Error("BACKUP_LOCAL_PATH must be an absolute path.");
  }

  private file(id: string, suffix: ".dump" | ".json" | ".partial") {
    assertBackupId(id);
    const resolved = path.resolve(this.root, `${id}${suffix}`);
    if (path.dirname(resolved) !== path.resolve(this.root)) throw new ApiError(400, "مسیر نسخه پشتیبان معتبر نیست.", "BACKUP_PATH_INVALID");
    return resolved;
  }

  private async prepare() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await chmod(this.root, 0o700);
  }

  async preflight(requiredBytes: number) {
    await this.prepare();
    const probe = path.join(this.root, `.backup-write-probe-${randomUUID()}`);
    const handle = await open(probe, "wx", 0o600);
    try { await handle.close(); } finally { await unlink(probe).catch(() => undefined); }
    const filesystem = await statfs(this.root);
    const availableBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
    if (!Number.isFinite(availableBytes) || availableBytes < requiredBytes) {
      throw new ApiError(507, "فضای کافی برای ایجاد نسخه پشتیبان وجود ندارد.", "BACKUP_STORAGE_INSUFFICIENT");
    }
    return { availableBytes };
  }

  async createTemporary(id: string) {
    await this.prepare();
    const temporaryPath = this.file(id, ".partial");
    const handle = await open(temporaryPath, "wx", 0o600);
    return { path: temporaryPath, handle };
  }

  async commit(id: string, temporaryPath: string) {
    const expected = this.file(id, ".partial");
    if (path.resolve(temporaryPath) !== expected) throw new ApiError(400, "مسیر موقت نسخه پشتیبان معتبر نیست.", "BACKUP_PATH_INVALID");
    const destination = this.file(id, ".dump");
    await rename(expected, destination);
    return destination;
  }

  async writeMetadata(id: string, metadata: unknown) {
    await this.prepare();
    const destination = this.file(id, ".json");
    const temporary = this.file(id, ".partial");
    await writeFile(temporary, JSON.stringify(metadata, null, 2), { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(temporary, destination);
  }

  async resolve(id: string) {
    const target = this.file(id, ".dump");
    let info;
    try { info = await stat(target); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new ApiError(404, "نسخه پشتیبان یافت نشد.", "BACKUP_NOT_FOUND"); throw error; }
    if (!info.isFile()) throw new ApiError(404, "نسخه پشتیبان یافت نشد.", "BACKUP_NOT_FOUND");
    return target;
  }

  async readMetadata(id: string) {
    return JSON.parse(await readFile(this.file(id, ".json"), "utf8"));
  }

  async remove(id: string) {
    const removeIfPresent = async (file: string) => { try { await unlink(file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } };
    await removeIfPresent(this.file(id, ".dump"));
    await removeIfPresent(this.file(id, ".json"));
    await removeIfPresent(this.file(id, ".partial"));
  }
}

export function getBackupStorage(env: NodeJS.ProcessEnv = process.env): BackupStorage {
  const driver = env.BACKUP_STORAGE_DRIVER?.trim() || "local";
  if (driver !== "local") throw new Error(`Unsupported BACKUP_STORAGE_DRIVER: ${driver}`);
  const root = env.BACKUP_LOCAL_PATH?.trim();
  if (!root) throw new Error("BACKUP_LOCAL_PATH is required for local backup storage.");
  const publicRoot = path.resolve(process.cwd(), "public");
  const repositoryRoot = path.resolve(/* turbopackIgnore: true */ process.cwd());
  const resolvedRoot = path.resolve(root);
  if ([path.parse(resolvedRoot).root, "/var", "/var/www", "/root", "/home"].includes(resolvedRoot)) throw new Error("BACKUP_LOCAL_PATH must be a dedicated directory.");
  if (resolvedRoot === publicRoot || resolvedRoot.startsWith(`${publicRoot}${path.sep}`)) throw new Error("BACKUP_LOCAL_PATH must never be inside /public.");
  if (env.NODE_ENV === "production" && (resolvedRoot === repositoryRoot || resolvedRoot.startsWith(`${repositoryRoot}${path.sep}`))) throw new Error("BACKUP_LOCAL_PATH must be outside the application repository in production.");
  return new LocalBackupStorage(root);
}
