// Reporting bounded context — read-only aggregations over tenant data (§18 async).
import { PortCall } from '../port-operations/entities/index.js';

export interface DashboardSummary {
  openPortCalls: number;
  overdueMilestones: number;
  clearedToday: number;
  byAuthority: Record<string, { pending: number; overdue: number; cleared: number }>;
}

export function summarize(portCalls: PortCall[], now = new Date()): DashboardSummary {
  const s: DashboardSummary = { openPortCalls: 0, overdueMilestones: 0, clearedToday: 0, byAuthority: {} };
  for (const pc of portCalls) {
    if (pc.status === 'in_progress' || pc.status === 'scheduled') s.openPortCalls++;
    for (const m of pc.processes.flatMap(p => p.milestones)) {
      const b = (s.byAuthority[m.authority] ??= { pending: 0, overdue: 0, cleared: 0 });
      if (m.status === 'overdue') { s.overdueMilestones++; b.overdue++; }
      else if (m.status === 'cleared') {
        b.cleared++;
        if (m.completedAt && new Date(m.completedAt).toDateString() === now.toDateString()) s.clearedToday++;
      }
      else b.pending++;
    }
  }
  return s;
}

export function toCsv(rows: Array<Record<string, string | number>>): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const esc = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;
  return [keys.join(','), ...rows.map(r => keys.map(k => esc(r[k] ?? '')).join(','))].join('\n');
}
