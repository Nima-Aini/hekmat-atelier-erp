"use client";
import { useSearchParams } from "next/navigation";
import { useState, type Dispatch, type SetStateAction } from "react";
/** Shareable UI state. Writes only browser history, never business records. */
export function useUrlState<T>(key: string, initial: T, validate?: (value: T) => boolean): [T, Dispatch<SetStateAction<T>>] {
  const params = useSearchParams(); const [fallback] = useState(initial);
  const read = (raw: string | null): T => { if (raw === null) return fallback; try { const value = JSON.parse(raw); if (typeof value !== typeof fallback || value === null || (typeof value === "number" && !Number.isFinite(value)) || (validate && !validate(value as T))) return fallback; return value as T; } catch { return fallback; } };
  const value = read(params.get(key));
  const set: Dispatch<SetStateAction<T>> = next => {
    const url = new URL(window.location.href); const old = read(url.searchParams.get(key));
    const resolved = typeof next === "function" ? (next as (value: T) => T)(old) : next;
    url.searchParams.set(key, JSON.stringify(resolved));
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  };
  return [value, set];
}
