"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Draft } from "@prisma/client";
import { reviewSnapshotReceipt, type ReviewSnapshotReceipt } from "@/lib/services/publish/review-snapshot";
import { reviewDeskCanMutateCreative } from "@/lib/services/publish/review-desk";
import { sanitizeMediaUrls } from "@/lib/services/publish/safety";

export type ReviewEditField = "caption" | "media";
export interface ReviewEditRequest {
  token: number;
  id: string;
  field: ReviewEditField;
  base: Draft;
  receipt: ReviewSnapshotReceipt;
  caption: string;
  mediaUrls: string[];
}

export interface ReviewEditSession<T extends Draft> {
  source: T;
  base: Draft;
  caption: string;
  mediaFirst: string;
  mediaRest: string[];
  captionOpen: boolean;
  latest: Draft | null;
  pending: ReviewEditRequest | null;
  issue: "unconfirmed" | "missing" | null;
  refreshing: boolean;
  refreshSource: readonly T[] | null;
  seen: string;
  retired: string[];
  saved: boolean;
}

function identity(draft: Draft): string {
  return JSON.stringify([draft.id, draft.bandId, draft.platform, draft.status, draft.reviewNotes, reviewSnapshotReceipt(draft)]);
}

function initial<T extends Draft>(draft: T): ReviewEditSession<T> {
  return {
    source: draft, base: draft, caption: draft.caption,
    mediaFirst: draft.mediaUrls[0] ?? "", mediaRest: draft.mediaUrls.slice(1),
    captionOpen: false, latest: null, pending: null, issue: null,
    refreshing: false, refreshSource: null, seen: identity(draft), retired: [], saved: false,
  };
}

export function reviewEditMedia<T extends Draft>(session: ReviewEditSession<T>): string[] {
  return [...(session.mediaFirst.trim() ? [session.mediaFirst] : []), ...session.mediaRest];
}

export function reviewEditDirty<T extends Draft>(session: ReviewEditSession<T>) {
  const caption = session.caption !== session.base.caption;
  const media = session.mediaFirst !== (session.base.mediaUrls[0] ?? "") ||
    JSON.stringify(session.mediaRest) !== JSON.stringify(session.base.mediaUrls.slice(1));
  return { caption, media, any: caption || media };
}

function reconcile<T extends Draft>(session: ReviewEditSession<T>, incoming: T | undefined, rows: readonly T[]): ReviewEditSession<T> {
  if (!incoming) {
    return session.issue === "missing" ? session : { ...session, issue: "missing", refreshing: false };
  }
  if (incoming.bandId !== session.base.bandId || incoming.platform !== session.base.platform) {
    return { ...session, issue: "missing", refreshing: false };
  }
  const key = identity(incoming);
  const explicitRead = session.refreshing && rows !== session.refreshSource;
  if (key === session.seen && !explicitRead) return session;
  const baseKey = identity(session.base);
  // A server-action receipt already confirmed this base. A delayed old RSC
  // response must not roll it back or manufacture a new conflict.
  if ((key !== baseKey && session.retired.includes(key)) ||
    new Date(incoming.updatedAt).getTime() < new Date(session.base.updatedAt).getTime() ||
    incoming.currentVersion < session.base.currentVersion) {
    return explicitRead ? {
      ...session, issue: "unconfirmed", refreshing: false, refreshSource: null,
    } : session;
  }
  if (session.pending) return { ...session, source: incoming, seen: key, latest: key === baseKey ? session.latest : incoming };
  if (!reviewEditDirty(session).any && !session.issue && !explicitRead) {
    return { ...initial(incoming), captionOpen: session.captionOpen, saved: session.saved, retired: session.retired };
  }
  if (key === baseKey && !explicitRead) return { ...session, source: incoming, seen: key };
  return {
    ...session, source: incoming, seen: key, latest: incoming,
    issue: explicitRead ? null : session.issue,
    refreshing: explicitRead ? false : session.refreshing,
    refreshSource: explicitRead ? null : session.refreshSource,
  };
}

function validSavedRow(value: unknown, request: ReviewEditRequest): value is Draft {
  if (!value || typeof value !== "object") return false;
  const row = value as Draft;
  try {
    if (row.id !== request.id || row.bandId !== request.base.bandId || row.platform !== request.base.platform ||
      row.status !== "IN_REVIEW" || row.reviewedAt !== null || row.reviewNotes !== request.base.reviewNotes || typeof row.caption !== "string" ||
      !Array.isArray(row.mediaUrls) || !row.mediaUrls.every((url) => typeof url === "string") ||
      !Array.isArray(row.hashtags) || !row.hashtags.every((tag) => typeof tag === "string") ||
      !Array.isArray(row.riskFlags) || !row.riskFlags.every((flag) => typeof flag === "string") ||
      !["LOW", "MEDIUM", "HIGH"].includes(row.riskLevel) || !Number.isInteger(row.currentVersion)) return false;
    reviewSnapshotReceipt(row);
    if (new Date(row.updatedAt).getTime() < new Date(request.base.updatedAt).getTime()) return false;
    if (request.field === "caption") {
      return row.caption === request.caption && row.currentVersion === request.base.currentVersion + 1 &&
        JSON.stringify(row.mediaUrls) === JSON.stringify(request.base.mediaUrls) &&
        JSON.stringify(row.hashtags) === JSON.stringify(request.base.hashtags);
    }
    return JSON.stringify(row.mediaUrls) === JSON.stringify(sanitizeMediaUrls(request.mediaUrls)) &&
      row.caption === request.base.caption && row.currentVersion === request.base.currentVersion &&
      JSON.stringify(row.hashtags) === JSON.stringify(request.base.hashtags) &&
      row.riskLevel === request.base.riskLevel && JSON.stringify(row.riskFlags) === JSON.stringify(request.base.riskFlags);
  } catch { return false; }
}

/** React-mount-only edit state. Never writes browser storage or creates a second queue. */
export function useReviewEditSessions<T extends Draft>(drafts: readonly T[]) {
  const rows = useRef(drafts);
  rows.current = drafts;
  const sessions = useRef(new Map<string, ReviewEditSession<T>>());
  const nextToken = useRef(0);
  const mounted = useRef(true);
  const [, render] = useState(0);
  const refresh = useCallback(() => { if (mounted.current) render((value) => value + 1); }, []);
  const read = useCallback((draft: T): ReviewEditSession<T> => {
    const session = sessions.current.get(draft.id);
    return session ? reconcile(session, rows.current.find((row) => row.id === draft.id), rows.current) : initial(draft);
  }, []);
  const write = useCallback((id: string, session: ReviewEditSession<T>) => {
    if (!mounted.current) return;
    sessions.current.set(id, session);
    refresh();
  }, [refresh]);

  useEffect(() => {
    let changed = false;
    for (const [id, session] of sessions.current) {
      const next = reconcile(session, drafts.find((row) => row.id === id), drafts);
      if (next !== session) { sessions.current.set(id, next); changed = true; }
    }
    if (changed) refresh();
  }, [drafts, refresh]);

  useEffect(() => {
    mounted.current = true;
    const unfinished = () => [...sessions.current.values()].some((session) =>
      reviewEditDirty(session).any || session.pending || session.issue || session.latest);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (unfinished()) { event.preventDefault(); event.returnValue = ""; }
    };
    const leave = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !unfinished()) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const target = new URL(link.href, window.location.href);
      if (target.origin === window.location.origin && target.pathname === "/review-queue") return;
      if (!window.confirm("You have unsaved review edits. Leaving this page will lose them. Leave anyway?")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", leave, true);
    return () => {
      mounted.current = false;
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", leave, true);
    };
  }, []);

  return {
    read,
    retained: (id: string) => {
      const session = sessions.current.get(id);
      return session && (reviewEditDirty(session).any || session.issue || session.pending)
        ? session.source : undefined;
    },
    setCaptionOpen(draft: T, open: boolean) {
      const session = read(draft);
      if (!session.pending) write(draft.id, { ...session, captionOpen: open });
    },
    edit(draft: T, field: ReviewEditField, value: string) {
      const session = read(draft);
      if (session.pending) return;
      write(draft.id, { ...session, ...(field === "caption" ? { caption: value } : { mediaFirst: value }), saved: false });
    },
    discard(draft: T) {
      const session = read(draft);
      if (session.pending || session.issue) return false;
      const next = session.latest ?? session.base;
      write(draft.id, { ...initial({ ...session.source, ...next }), retired: [...session.retired, identity(session.base)].slice(-4) });
      return true;
    },
    review(draft: T, keep: boolean) {
      const session = read(draft);
      if (session.pending || session.issue || !session.latest || (keep && !reviewDeskCanMutateCreative(session.latest.status))) return false;
      const latest = session.latest;
      const dirty = reviewEditDirty(session);
      const next = { ...initial({ ...session.source, ...latest }), captionOpen: session.captionOpen, retired: [...session.retired, identity(session.base)].slice(-4) };
      write(draft.id, keep ? {
        ...next,
        caption: dirty.caption ? session.caption : next.caption,
        mediaFirst: dirty.media ? session.mediaFirst : next.mediaFirst,
        mediaRest: dirty.media ? session.mediaRest : next.mediaRest,
      } : next);
      return true;
    },
    requestRefresh(draft: T) {
      const session = read(draft);
      if (session.pending) return false;
      write(draft.id, { ...session, refreshing: true, refreshSource: rows.current });
      return true;
    },
    begin(draft: T, field: ReviewEditField): ReviewEditRequest | null {
      const session = read(draft);
      const dirty = reviewEditDirty(session);
      if (session.pending || session.latest || session.issue || session.refreshing || !dirty[field] || !reviewDeskCanMutateCreative(session.base.status)) return null;
      const request: ReviewEditRequest = {
        token: ++nextToken.current, id: draft.id, field, base: session.base,
        receipt: reviewSnapshotReceipt(session.base), caption: session.caption, mediaUrls: reviewEditMedia(session),
      };
      write(draft.id, { ...session, pending: request, saved: false });
      return request;
    },
    finish(request: ReviewEditRequest, result: unknown): boolean {
      const prior = sessions.current.get(request.id);
      if (!mounted.current || prior?.pending?.token !== request.token) return false;
      const session = reconcile(prior, rows.current.find((row) => row.id === request.id), rows.current);
      if (!validSavedRow(result, request)) {
        write(request.id, { ...session, pending: null, issue: "unconfirmed", refreshing: false });
        return false;
      }
      const otherDirty = reviewEditDirty(session);
      const latest = session.latest && identity(session.latest) !== identity(result) &&
        new Date(session.latest.updatedAt).getTime() >= new Date(result.updatedAt).getTime()
        ? session.latest : null;
      write(request.id, {
        ...session, base: result, pending: null, issue: session.issue === "missing" ? "missing" : null,
        caption: request.field === "caption" || !otherDirty.caption ? result.caption : session.caption,
        mediaFirst: request.field === "media" || !otherDirty.media ? result.mediaUrls[0] ?? "" : session.mediaFirst,
        mediaRest: request.field === "media" || !otherDirty.media ? result.mediaUrls.slice(1) : session.mediaRest,
        captionOpen: request.field === "caption" ? false : session.captionOpen,
        latest, refreshing: false, refreshSource: null, saved: true,
        retired: [...session.retired, identity(request.base)].slice(-4),
      });
      return true;
    },
  };
}

export type ReviewEditSessions<T extends Draft> = ReturnType<typeof useReviewEditSessions<T>>;
