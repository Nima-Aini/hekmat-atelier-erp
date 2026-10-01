import crypto from "node:crypto";
import { db } from "@/db";
import { authLoginAttempts, employees, employeeAccounts, roles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ApiError } from "@/lib/apiError";
declare global {
  var __akmaDevAuthSecret: string | undefined;
}
const secret = () => {
  const value = process.env.AUTH_SECRET || process.env.AUTH_SALT;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET در محیط Production تنظیم نشده است. لطفاً متغیر محیطی AUTH_SECRET را تنظیم کنید.");
  }
  // In development, generate a random secret per process instance for safety
  if (!globalThis.__akmaDevAuthSecret) {
    globalThis.__akmaDevAuthSecret = crypto.randomBytes(32).toString("hex");
  }
  return globalThis.__akmaDevAuthSecret;
};

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function signSession(employeeId: string) {
  const payload = Buffer.from(`${employeeId}.${Date.now()}`).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySessionDetails(token: string): { employeeId: string; issuedAt: Date } | null {
  if (token.split(".").length !== 2) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const [id, ts] = Buffer.from(payload, "base64url").toString("utf8").split(".");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id) || !ts || !Number.isFinite(Number(ts))) return null;
    const tokenAge = Date.now() - Number(ts);
    if (tokenAge > 12 * 60 * 60 * 1000 || tokenAge < 0) return null;
    return { employeeId: id, issuedAt: new Date(Number(ts)) };
  } catch {
    return null;
  }
}

export function verifySession(token: string): string | null {
  return verifySessionDetails(token)?.employeeId || null;
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

export function loginAttemptKey(username: string, clientAddress: string) {
  return crypto.createHash("sha256").update(`${username.trim().toLowerCase()}\u0000${clientAddress}`).digest("hex");
}

export async function assertLoginAllowed(key: string) {
  const [row] = await db.select().from(authLoginAttempts).where(eq(authLoginAttempts.key, key)).limit(1);
  if (row?.blockedUntil && row.blockedUntil.getTime() > Date.now()) throw new ApiError(429, "تعداد تلاش‌های ورود بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید.", "LOGIN_RATE_LIMITED");
}

export async function recordLoginFailure(key: string) {
  await db.transaction(async (tx) => {
    await tx.insert(authLoginAttempts).values({ key, attempts: 0 }).onConflictDoNothing();
    const [row] = await tx.select().from(authLoginAttempts).where(eq(authLoginAttempts.key, key)).for("update").limit(1);
    const now = new Date();
    const expired = !row || now.getTime() - row.windowStartedAt.getTime() >= LOGIN_WINDOW_MS;
    const attempts = expired ? 1 : row.attempts + 1;
    await tx.update(authLoginAttempts).set({ attempts, windowStartedAt: expired ? now : row!.windowStartedAt, blockedUntil: attempts >= LOGIN_MAX_ATTEMPTS ? new Date(now.getTime() + LOGIN_BLOCK_MS) : null, updatedAt: now }).where(eq(authLoginAttempts.key, key));
  });
}

export async function clearLoginFailures(key: string) {
  await db.delete(authLoginAttempts).where(eq(authLoginAttempts.key, key));
}

export async function ensureDefaultAdminAccount() {
  const production = process.env.NODE_ENV === "production";
  const allowDevBootstrap = process.env.ALLOW_DEV_ADMIN_BOOTSTRAP === "true";
  const username = process.env.INITIAL_ADMIN_USERNAME?.trim();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const [existingAdmin] = await db.select({ id: employeeAccounts.id }).from(employeeAccounts).innerJoin(roles, eq(employeeAccounts.roleId, roles.id)).where(eq(roles.code, "admin")).limit(1);
  if (existingAdmin) return;
  if (!username || !password) {
    if (production) throw new Error("Initial administrator bootstrap requires INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD.");
    if (!allowDevBootstrap) return;
    throw new Error("ALLOW_DEV_ADMIN_BOOTSTRAP requires explicit INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD values.");
  }
  if (!production && !allowDevBootstrap) return;
  if (password.length < 12) throw new Error("INITIAL_ADMIN_PASSWORD must contain at least 12 characters.");
  const [existingByUsername] = await db
    .select({ id: employeeAccounts.id })
    .from(employeeAccounts)
    .where(eq(employeeAccounts.username, username))
    .limit(1);
  if (existingByUsername) throw new Error("Initial administrator username already belongs to a non-admin account.");

  let [employee] = await db
    .select()
    .from(employees)
    .where(eq(employees.code, "EMP-ADMIN-001"))
    .limit(1);

  if (employee) {
    const [existingByEmployee] = await db
      .select({ id: employeeAccounts.id })
      .from(employeeAccounts)
      .where(eq(employeeAccounts.employeeId, employee.id))
      .limit(1);
    if (existingByEmployee) throw new Error("Bootstrap administrator employee already has a non-admin account.");
  }

  if (!employee) {
    [employee] = await db
      .insert(employees)
      .values({
        code: "EMP-ADMIN-001",
        name: "مدیر سیستم",
        mobile: "09999999999",
        cooperationType: "employee",
        role: "admin",
        status: "active",
        offboardingStage: "active",
      })
      .returning();
  }

  const [role] = await db.select().from(roles).where(eq(roles.code, "admin")).limit(1);
  if (!role) throw new Error("نقش مدیر سیستم در دیتابیس وجود ندارد.");

  await db
    .insert(employeeAccounts)
    .values({
      employeeId: employee.id,
      username,
      passwordHash: hashPassword(password),
      roleId: role.id,
      status: "active",
    })
    .onConflictDoNothing();
}
