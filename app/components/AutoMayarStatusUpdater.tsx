"use client";

import { useCallback, useEffect, useRef } from "react";

const UPDATE_INTERVAL_MS = 5 * 60 * 1000;
const SHARED_LOCK_KEY = "elzade_mayar_status_last_update";
const MIN_SHARED_GAP_MS = 4 * 60 * 1000;

export default function AutoMayarStatusUpdater() {
  const runningRef = useRef(false);

  const updateMayarStatuses = useCallback(async () => {
    if (runningRef.current) return;
    if (typeof window === "undefined") return;
    if (document.visibilityState !== "visible") return;

    const now = Date.now();
    const lastSharedUpdate = Number(
      window.localStorage.getItem(SHARED_LOCK_KEY) || 0
    );

    if (now - lastSharedUpdate < MIN_SHARED_GAP_MS) {
      return;
    }

    runningRef.current = true;
    window.localStorage.setItem(SHARED_LOCK_KEY, String(now));

    try {
      const response = await fetch("/api/mayar/order-status", {
        method: "GET",
        cache: "no-store",
      });

      const result = await response.json().catch(() => null);

      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.error || "فشل التحديث التلقائي لحالات المعيار"
        );
      }

      window.dispatchEvent(
        new CustomEvent("mayar-statuses-updated", {
          detail: {
            updatedAt: new Date().toISOString(),
          },
        })
      );
    } catch (error) {
      console.error("Auto Mayar status update failed:", error);
      window.localStorage.removeItem(SHARED_LOCK_KEY);
    } finally {
      runningRef.current = false;
    }
  }, []);

  useEffect(() => {
    const firstRunTimer = window.setTimeout(() => {
      updateMayarStatuses();
    }, 1500);

    const interval = window.setInterval(() => {
      updateMayarStatuses();
    }, UPDATE_INTERVAL_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        updateMayarStatuses();
      }
    }

    function handleOnline() {
      updateMayarStatuses();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);

    return () => {
      window.clearTimeout(firstRunTimer);
      window.clearInterval(interval);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
      window.removeEventListener("online", handleOnline);
    };
  }, [updateMayarStatuses]);

  return null;
}
