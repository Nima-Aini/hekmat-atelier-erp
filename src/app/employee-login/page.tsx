"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, ShieldCheck, KeyRound, User } from "lucide-react";

export default function EmployeeLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (userToSubmit?: string, passToSubmit?: string) => {
    const u = userToSubmit || username;
    const p = passToSubmit || password;

    if (!u.trim() || !p.trim()) {
      setError("لطفاً نام کاربری و کلمه عبور را وارد فرمایید.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/employee-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u, password: p }),
      }).then((v) => v.json());

      if (!res.success) {
        setError(res.error || "نام کاربری یا کلمه عبور نادرست است.");
        return;
      }

      router.push("/");
    } catch (err: any) {
      setError(err?.message || "خطا در ارتباط با سرور");
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleLogin();
  };

  return (
    <main className="min-h-screen bg-[#050506] text-white flex items-center justify-center p-4 selection:bg-red-600 selection:text-white relative overflow-hidden">
      <div className="pointer-events-none absolute -left-20 -top-20 h-80 w-80 rounded-full border-[38px] border-red-950/30 shadow-[0_0_110px_rgba(239,35,60,.18)]" />
      <div className="w-full max-w-md space-y-6">
        {/* Logo / Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-red-700 bg-red-950/60 text-red-300 shadow-[0_0_35px_rgba(239,35,60,.25)] mb-2">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">حکمت آتلیه</h1>
          <p className="text-xs text-slate-400">
            سیستم یکپارچه قرارداد، برنامه ریزی و مدیریت آتلیه
          </p>
        </div>

        {/* Login Form */}
        <form
          onSubmit={submit}
          className="rounded-3xl border border-red-950 bg-[#0b0b0d]/95 backdrop-blur-md p-6 sm:p-8 space-y-4 shadow-2xl"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-red-400" />
              نام کاربری / شماره همراه:
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="نام کاربری یا شماره همراه"
              className="w-full rounded-xl bg-black border border-zinc-800 p-3 text-xs text-white placeholder-zinc-600 focus:border-red-600 outline-none font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-red-400" />
              کلمه عبور:
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl bg-black border border-zinc-800 p-3 text-xs text-white placeholder-zinc-600 focus:border-red-600 outline-none"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300 animate-in fade-in">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-red-700 py-3 text-xs font-bold text-white shadow-[0_0_24px_rgba(239,35,60,.22)] hover:bg-red-600 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogIn className="h-4 w-4" />
            <span>{loading ? "در حال بررسی..." : "ورود به حساب کاربری"}</span>
          </button>
        </form>

        {/* Security notice */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 space-y-2.5">
          <p className="text-[11px] text-slate-400 text-center font-medium">
            ورود فقط برای اعضای مجاز تیم آتلیه است. اطلاعات حساب را با دیگران به اشتراک نگذارید.
          </p>
        </div>
      </div>
    </main>
  );
}
