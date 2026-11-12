# Hekmat Atelier ERP

ERP آتلیه حکمت بر پایه هسته مالی حکمت. صورتحساب، دریافت، هزینه و مانده حساب در هسته ERP ثبت می‌شوند و رکوردهای Studio فقط اطلاعات دامنه و پیوند مالی را نگه می‌دارند.

## راه‌اندازی توسعه

```bash
npm ci
cp .env.example .env
npm run dev
```

برای PostgreSQL، `DB_DRIVER=postgres` و `DATABASE_URL` را تنظیم کنید. PGlite فقط در توسعه/تست و تنها با `DB_DRIVER=pglite` فعال می‌شود. در production فقط PostgreSQL مجاز است و نبودن یا نامعتبر بودن `DATABASE_URL` باعث توقف startup/readiness می‌شود.

## ایجاد مدیر اولیه

در production، اگر هیچ مدیر اولیه‌ای وجود ندارد، هر دو متغیر زیر الزامی‌اند:

- `INITIAL_ADMIN_USERNAME`
- `INITIAL_ADMIN_PASSWORD` (حداقل ۱۲ نویسه)

هیچ نام کاربری یا رمز پیش‌فرضی وجود ندارد. bootstrap توسعه فقط خارج از production و با `ALLOW_DEV_ADMIN_BOOTSTRAP=true` مجاز است و همچنان credentials باید صریحاً تنظیم شوند.

## سرویس نقشه نشان

کلید فقط از `NESHAN_API_KEY` خوانده می‌شود. کلید در frontend یا log برگردانده نمی‌شود. چون کلید قبلاً در source قرار داشته، باید کلید نشان به‌صورت دستی rotate شود.

## Backup و Restore

Backup با `pg_dump --format=custom`، checksum نوع SHA-256 و metadata مستقل ایجاد می‌شود. فایل داخل public قرار نمی‌گیرد. Restore قدیمی مبتنی بر JSON/TRUNCATE کاملاً حذف شده است. Restore برنامه فقط به دیتابیس PostgreSQL خالی و مجزا انجام می‌شود و پس از بررسی migration و integrity، مقصد را برای switch دستی آماده می‌کند.

```bash
npm run backup:create
npm run integrity:check
```

راهنمای عملیاتی کامل در `docs/operations-backup-restore.md` قرار دارد.

## Quality gates

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## GitHub Actions deployment

Workflow فقط SHA دقیق تأییدشده در job آزمون را deploy می‌کند. تا وقتی تمام تنظیمات زیر در GitHub Environment/Repository تعریف نشده باشند، deploy با پیام واضح متوقف می‌شود و مقدار production حدس زده نمی‌شود.

Repository variables:

- `DEPLOY_PATH`
- `PM2_APP_NAME`
- `APP_PORT`
- `READINESS_URL` (must target `/api/readiness`, not the liveness endpoint)
- `DEPLOY_REPOSITORY_URL` — باید دقیقاً `https://github.com/Nima-Aini/hekmat-atelier-erp.git` باشد

Environment secrets:

- `SSH_HOST`
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `SSH_PORT` (اختیاری؛ پیش‌فرض 22)

زنجیره اجباری workflow: install → typecheck → tests → lint → production build → deploy exact SHA → health check.
