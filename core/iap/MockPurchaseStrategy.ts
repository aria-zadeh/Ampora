/**
 * MockPurchaseStrategy — today's ship-now purchase behaviour (PRD FR-88).
 *
 * No transaction, no receipt, no store round-trip. This is what keeps the
 * Windows and web builds byte-identical to before this task: every method
 * here reproduces exactly what `app/paywall.tsx` did inline before the
 * `PurchaseStrategy` seam existed — see `core/blocking/SoftBlockingStrategy.ts`
 * for the equivalent role on the Ignition side of the native quarantine.
 *
 * Pure TS: no react-native-purchases import, no I/O, no `react-native` /
 * `expo` import. Safe on web AND under the plain-Node vitest harness
 * (`vitest.config.ts` — `core/**` must stay importable outside Metro).
 */
import type { Settings } from '@/types'
import type {
  IapOffering,
  IapPlan,
  PurchaseResult,
  PurchaseStrategy,
  RestoreResult,
} from './PurchaseStrategy'

/**
 * Illustrative placeholder pricing (PRD FR-88: "annual about 10% cheaper per
 * month"). Real prices come from App Store Connect / Play Console once a
 * native build fetches real offerings from RevenueCat; `app/paywall.tsx`
 * falls back to this exact list whenever `getOfferings()` resolves empty
 * (true today for the mock, and also true for a native build before
 * RevenueCat offerings are configured in the dashboard).
 */
export const PLACEHOLDER_OFFERINGS: IapOffering[] = [
  { productId: 'ampora_monthly_placeholder', plan: 'monthly', localizedPrice: '$6.99' },
  {
    productId: 'ampora_annual_placeholder',
    plan: 'annual',
    localizedPrice: '$74.99',
    priceNote: '$6.25/mo · save ~10%',
  },
]

export class MockPurchaseStrategy implements PurchaseStrategy {
  readonly kind = 'mock' as const

  /** Nothing to set up: there is no billing connection on the mock path. */
  async init(): Promise<void> {
    // Intentionally empty.
  }

  /** Same placeholder list every time, so the mock and "no real offerings yet" states render identically. */
  async getOfferings(): Promise<IapOffering[]> {
    return PLACEHOLDER_OFFERINGS
  }

  /**
   * Always "succeeds" with no real transaction — this is the documented
   * scaffold behaviour FR-88 calls out ("real purchasing... is a documented
   * later step"). The caller (`app/paywall.tsx`) is the one that actually
   * writes `settings.subscription` after this resolves, exactly like it did
   * before this seam existed.
   */
  async purchase(_plan: IapPlan): Promise<PurchaseResult> {
    return { ok: true }
  }

  /** No real purchase was ever made on this path, so there is honestly nothing to restore. */
  async restore(): Promise<RestoreResult> {
    return { ok: false }
  }

  /** The mock never asserts an external entitlement — local settings state (trial/active/lapsed) is authoritative in dev/web/Windows. */
  async getEntitlement(): Promise<Settings['subscription'] | null> {
    return null
  }
}

/** A ready-to-use shared instance (the strategy is stateless). */
export const mockPurchaseStrategy = new MockPurchaseStrategy()
