//
//  ShieldConfigurationExtension.swift
//  Ampora Ignition — ShieldConfiguration extension target (docs/05 §3.7).
//
//  Registered as the `AmporaShieldConfiguration` app-extension target by
//  `../../../plugin/withExtensionTargets.js`. Supplies the block-screen
//  content a user sees when they open a shielded app during a stake. The API
//  only allows icon, title, subtitle, button labels, and colors — no custom
//  views, fonts, or animations (docs/05 §1).
//
//  Copy varies by hold (docs/05 §3.7, docs/04 §2), read from the App Group
//  because `applyShield` on the TS side only ever receives a `StakeSelection`
//  (never the hold) by design — see `AmporaIgnitionNativeModule
//  .setSessionDisplayHold` in ../../src/types.ts for the extra, beyond-the-
//  shared-interface call that sets it. Falls back to the `session` copy (the
//  default hold, docs/04 §2) if it was never set, so this extension never
//  shows garbled or missing text.
//
//  Calm, non-shaming copy always (docs/09 §5 wellbeing stance) — no matter
//  what triggered the shield, the block screen never scolds.
//
import ManagedSettings
import ManagedSettingsUI
import UIKit

final class AmporaShieldConfigurationExtension: ShieldConfigurationDataSource {

    override func configuration(shielding application: Application) -> ShieldConfiguration {
        Self.buildConfiguration()
    }

    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration {
        Self.buildConfiguration()
    }

    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
        Self.buildConfiguration()
    }

    override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration {
        Self.buildConfiguration()
    }

    // MARK: -

    private static func buildConfiguration() -> ShieldConfiguration {
        let subtitle: String
        switch AppGroupStore.sessionHold() {
        case "until_done":
            subtitle = "Your apps unlock when you finish and submit proof in Ampora."
        default:
            // "session" (the default hold, docs/04 §2) and any unrecognized
            // value both fall back to the session copy — never garbled text.
            subtitle = "Your apps unlock when this session ends. Open Ampora to keep going."
        }

        return ShieldConfiguration(
            backgroundBlurStyle: .systemMaterial,
            backgroundColor: nil, // design-system canvas; nil defers to the system material above
            icon: UIImage(named: "AmporaShieldIcon"),
            title: ShieldConfiguration.Label(
                text: "Locked while you focus",
                color: .label
            ),
            subtitle: ShieldConfiguration.Label(
                text: subtitle,
                color: .secondaryLabel
            ),
            primaryButtonLabel: ShieldConfiguration.Label(
                // Handled in ShieldActionExtension.swift. The shield CANNOT
                // launch Ampora directly (docs/05 §1, §3.8) — tapping this
                // posts a local notification that deep-links back instead.
                text: "Open Ampora",
                color: .white
            ),
            primaryButtonBackgroundColor: UIColor(red: 0.145, green: 0.388, blue: 0.922, alpha: 1), // #2563EB (design system primary)
            secondaryButtonLabel: ShieldConfiguration.Label(
                // Starts the 60s panic-valve friction IN THE APP (docs/05
                // §3.8, §3.9) — the extension only records intent, it cannot
                // show the countdown itself.
                text: "Unlock early",
                color: .secondaryLabel
            )
        )
    }
}
