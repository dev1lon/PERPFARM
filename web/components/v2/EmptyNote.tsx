"use client";

/**
 * The one way a protocol section says "there is nothing here yet".
 *
 * Empty states used to be invented per section: the points panel shouted
 * `NO POINTS YET` in 22px uppercase mono while the FDV panel two blocks below
 * said the same kind of thing in a quiet 14px sentence. Same meaning, two
 * voices, and the loud one read like an error. Every "no activity / no points /
 * no FDV market" state renders through here.
 */
export function EmptyNote({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  // Voice only -- size stays with the caller. A minimum height baked in here
  // was measured against the full-width FDV panel and, reused inside a
  // half-width card that already carries a heading, left a dead gap under it.
  return (
    <p className={`flex items-center justify-center px-6 py-6 text-center text-[14px] text-text-muted ${className}`}>
      {children}
    </p>
  );
}
