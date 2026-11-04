"use client";
import { useCallback, useEffect, useState } from "react";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000").replace(/\/$/, "");
const TOKEN_KEY = "rollcall-token";
const SLOW_AFTER_MS = 3500;
export const SLOW_EVENT = "rollcall-api-slow";

export class ApiError extends Error {
  constructor(message: string, public status: number, public data: Record<string, unknown> = {}) {
    super(message);
  }
}

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked: the user simply stays signed out.
  }
};

let inFlightSlow = 0;
const announceSlow = (delta: number) => {
  inFlightSlow += delta;
  window.dispatchEvent(new CustomEvent(SLOW_EVENT, { detail: inFlightSlow > 0 }));
};

export async function api<T = Record<string, unknown>>(path: string, options: { method?: string; body?: unknown; quiet?: boolean } = {}): Promise<T> {
  const token = getToken();
  // The free server sleeps when idle, so tell people why the first request is taking a while.
  let slow = false;
  const timer = options.quiet
    ? undefined
    : setTimeout(() => {
        slow = true;
        announceSlow(1);
      }, SLOW_AFTER_MS);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && token) {
        setToken(null);
        window.location.assign("/signin");
      }
      throw new ApiError(data.error ?? "Something went wrong. Please try again.", res.status, data);
    }
    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  } finally {
    clearTimeout(timer);
    if (slow) announceSlow(-1);
  }
}

/** Wakes a sleeping server ahead of the first real request. Failure doesn't matter here. */
export const wakeServer = () => fetch(`${API_URL}/health`).catch(() => undefined);

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [path]);

  useEffect(() => {
    let live = true;
    if (path) {
      api<T>(path)
        .then((result) => {
          if (live) {
            setData(result);
            setError(null);
          }
        })
        .catch((err: Error) => {
          if (live) setError(err.message);
        });
    }
    return () => {
      live = false;
    };
  }, [path]);

  return { data, error, reload, setData };
}

export type User = {
  id: number;
  email: string;
  name: string;
  role: "student" | "teacher";
  department: string;
  phone: string;
  employeeId: string;
  rollNo: string;
  year: string;
  division: string;
  semester: string;
  faceEnrolledAt: string | null;
  createdAt: string;
};

export type StudentRow = {
  id: number;
  email: string;
  name: string;
  department: string;
  phone: string;
  rollNo: string;
  year: string;
  division: string;
  semester: string;
  faceEnrolled: boolean;
};

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
export const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
export const percent = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

/** Download rows as a CSV that opens directly in Excel. */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const cell = (value: string | number) => {
    let text = String(value);
    // A leading = + - @ would run as a formula in Excel. Names are user-supplied, so neutralise it.
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const csv = "﻿" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const PENDING_CODE_KEY = "rollcall-pending-code";
export const savePendingCode = (code: string) => {
  try {
    localStorage.setItem(PENDING_CODE_KEY, code);
  } catch {}
};
export const takePendingCode = () => {
  try {
    const code = localStorage.getItem(PENDING_CODE_KEY);
    localStorage.removeItem(PENDING_CODE_KEY);
    return code;
  } catch {
    return null;
  }
};
