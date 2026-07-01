/**
 * 9.5.4 Session sizing for splittable tasks.
 *
 * Balanced: target = clamp(ceil(remaining / daysAvailable), minBlock, maxBlock);
 *   emit sessions of `target` until remaining is exhausted. A trailing
 *   remainder is emitted as its own session if it's >= minBlock, otherwise
 *   merged into the previous session.
 *
 * Front-load: emit maxBlock sessions earliest-first until remaining is
 *   exhausted (last one is the remainder).
 *
 * Defaults: minBlock = 30, maxBlock = 120 (per task if set).
 * Pure; returns an array of session sizes in minutes (all >= 1).
 */

import type { Task } from '@/types'
import type { WorkloadMode } from './types'

export const DEFAULT_MIN_BLOCK_MIN = 30
export const DEFAULT_MAX_BLOCK_MIN = 120

export function minBlockFor(task: Task): number {
  return Math.max(1, task.minBlockMin ?? DEFAULT_MIN_BLOCK_MIN)
}

export function maxBlockFor(task: Task): number {
  const min = minBlockFor(task)
  return Math.max(min, task.maxBlockMin ?? DEFAULT_MAX_BLOCK_MIN)
}

/**
 * Compute session sizes (minutes) for a splittable task.
 *
 * @param remaining     total minutes still to place (already progress-adjusted)
 * @param task          for min/max block bounds
 * @param mode          'balanced' | 'frontload'
 * @param daysAvailable count of days with any free capacity in [now, due]
 */
export function sessionSizes(
  remaining: number,
  task: Task,
  mode: WorkloadMode,
  daysAvailable: number
): number[] {
  if (remaining <= 0) return []
  const minB = minBlockFor(task)
  const maxB = maxBlockFor(task)

  // If the whole thing fits in one session at/under max, one session.
  if (remaining <= maxB) return [remaining]

  if (mode === 'frontload') {
    return frontloadSizes(remaining, maxB)
  }
  return balancedSizes(remaining, minB, maxB, daysAvailable)
}

/** Front-load: maxBlock chunks earliest-first, last chunk is the remainder. */
function frontloadSizes(remaining: number, maxB: number): number[] {
  const sizes: number[] = []
  let left = remaining
  while (left > 0) {
    const chunk = Math.min(maxB, left)
    sizes.push(chunk)
    left -= chunk
  }
  return mergeTinyTail(sizes, maxB)
}

/** Balanced: even daily target, clamped to [min, max]. */
function balancedSizes(
  remaining: number,
  minB: number,
  maxB: number,
  daysAvailable: number
): number[] {
  const days = Math.max(1, daysAvailable)
  const target = clamp(Math.ceil(remaining / days), minB, maxB)
  const sizes: number[] = []
  let left = remaining
  while (left > 0) {
    if (left <= target) {
      // Trailing remainder: keep as its own session if it clears minBlock,
      // else merge into the previous session (PRD §9.5.4).
      if (left >= minB || sizes.length === 0) {
        sizes.push(left)
      } else {
        sizes[sizes.length - 1] += left
      }
      left = 0
    } else {
      sizes.push(target)
      left -= target
    }
  }
  return sizes
}

/**
 * Guard the front-load path against a sub-usable tail: if the final chunk is
 * absurdly small it stays (front-load prioritizes speed over tidy blocks), but
 * if merging keeps us <= maxB we merge to avoid a stray tiny block.
 */
function mergeTinyTail(sizes: number[], maxB: number): number[] {
  if (sizes.length < 2) return sizes
  const last = sizes[sizes.length - 1]
  const prev = sizes[sizes.length - 2]
  if (last < maxB && prev + last <= maxB) {
    sizes[sizes.length - 2] = prev + last
    sizes.pop()
  }
  return sizes
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
