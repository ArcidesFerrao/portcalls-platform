// ---------------------------------------------------------------------------
// UI component library (§16: React 19 + Tailwind v4 in the Next.js build).
// Framework-flavoured TSX kept here as the canonical component contracts;
// server.ts renders equivalent HTML server-side with zero client JS.
// ---------------------------------------------------------------------------
import type { PortCallStatus } from '@portcalls/domain';

export interface BadgeProps { status: PortCallStatus | string }
/** Status badge — draft gray, scheduled blue, in_progress amber, completed green, closed slate, overdue red. */
export function Badge(_props: BadgeProps): string { return '<span class="badge"/>'; }

export interface ProgressRingProps { pct: number }
export function ProgressRing(_props: ProgressRingProps): string { return '<svg class="ring"/>'; }

export interface MilestoneTimelineProps {
  milestones: Array<{ name: string; authority: string; plannedAt: string; status: string }>;
}
/** Vertical timeline of milestones grouped by process, with overdue highlighting. */
export function MilestoneTimeline(_props: MilestoneTimelineProps): string { return '<ol class="timeline"/>'; }

export interface UploadZoneProps { entityType: string; entityId: string; accept?: string }
/** Drag & drop upload with MIME whitelist enforcement client-side too (§11). */
export function UploadZone(_props: UploadZoneProps): string { return '<div class="dropzone"/>'; }

export interface KpiCardProps { label: string; value: string | number; trend?: 'up' | 'down' }
export function KpiCard(_props: KpiCardProps): string { return '<div class="kpi"/>'; }
