// ─── No-show sweep ────────────────────────────────────────────────────────────
// Finds confirmed appointments whose scheduled slot (date + time) has passed
// with no check-in and marks them 'not-reported' (PRD §8). Used by the on-demand
// endpoint and the scheduled script. The slot-comparison logic is pure and
// testable; the sweep itself takes a Supabase client so it can run anywhere.

import type { SupabaseClient } from '@supabase/supabase-js'
import { appendEvent } from '../routes/auditLog.js'

/**
 * True when an appointment's slot is strictly in the past relative to `now`.
 * date is ISO yyyy-mm-dd; time is HH:MM (local). A missing date or time means
 * there is no concrete slot, so it is never "past".
 */
export function isPastSlot(date: string | null, time: string | null, now: Date): boolean {
  if (!date || !time) return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return false
  const slot = new Date(`${date}T${time}:00`)
  if (Number.isNaN(slot.getTime())) return false
  return slot.getTime() < now.getTime()
}

export interface SweepResult {
  swept: string[]   // ids transitioned to not-reported
  checked: number   // confirmed rows examined
}

/**
 * Sweep confirmed, un-checked-in appointments whose slot has passed. Each match
 * transitions confirmed → not-reported and records a 'not-reported' audit event
 * from the system actor. Returns the swept ids.
 */
export async function sweepNoShows(supabase: SupabaseClient, now: Date = new Date()): Promise<SweepResult> {
  // Candidates: confirmed, with a slot, not checked in.
  const { data, error } = await supabase
    .from('appointments')
    .select('id, date, time, status, checked_in_at')
    .eq('status', 'confirmed')
    .is('checked_in_at', null)
    .not('date', 'is', null)
    .not('time', 'is', null)
  if (error) throw new Error(`sweep read failed: ${error.message}`)

  const candidates = (data ?? []) as { id: string; date: string | null; time: string | null }[]
  const due = candidates.filter(c => isPastSlot(c.date, c.time, now))

  const swept: string[] = []
  const nowIso = now.toISOString()
  for (const c of due) {
    const upd = await supabase
      .from('appointments')
      .update({ status: 'not-reported', assigned_stage: 'Not reported', updated_at: nowIso })
      .eq('id', c.id)
      .eq('status', 'confirmed')          // guard against a concurrent change
      .is('checked_in_at', null)
      .select('id')
      .maybeSingle()
    if (upd.error) throw new Error(`sweep update ${c.id} failed: ${upd.error.message}`)
    if (!upd.data) continue               // row changed under us; skip

    await appendEvent(supabase, {
      appointmentId: c.id, action: 'not-reported',
      actorId: 'system', actorName: 'System', actorRole: 'system',
      summary: 'Marked not reported automatically (the appointment time passed with no check-in).',
      fromStatus: 'confirmed', toStatus: 'not-reported',
    })
    swept.push(c.id)
  }

  return { swept, checked: candidates.length }
}
