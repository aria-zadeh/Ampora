//
//  ShieldConfiguration.swift
//  Ampora — Ignition (ISOLATED reference scaffolding, NOT in the build)
//
//  Skeleton for the ShieldConfiguration app-extension target: the content of
//  the block screen a user sees when they open a shielded app during a stake
//  (docs/06 §3.7). The API only allows icon, title, subtitle, button labels,
//  and colors — no custom views, fonts, or animations.
//
//  Documentation only: not compiled by the RN/TS build, not imported from app
//  code. Requires the Family Controls entitlement + shared App Group.
//

import ManagedSettings
import ManagedSettingsUI
import UIKit

final class AmporaShieldConfigurationProvider: ShieldConfigurationDataSource {

    // Shown for a single shielded application.
    override func configuration(shielding application: Application) -> ShieldConfiguration {
        // Read the active session's mode/condition from the App Group to tailor
        // the copy (e.g. "Locked until you start" vs "Locked until done").
        // Copy is calm and non-shaming (wellbeing stance, docs/09 §5).
        return ShieldConfiguration(
            backgroundBlurStyle: .systemMaterial,
            backgroundColor: nil,                                  // design-system canvas
            icon: UIImage(named: "AmporaShieldIcon"),
            title: ShieldConfiguration.Label(
                text: "Locked until you start",
                color: .label
            ),
            subtitle: ShieldConfiguration.Label(
                text: "Finish your first move in Ampora to unlock.",
                color: .secondaryLabel
            ),
            primaryButtonLabel: ShieldConfiguration.Label(
                text: "Open Ampora",                               // handled in ShieldAction.swift
                color: .white
            ),
            primaryButtonBackgroundColor: UIColor(red: 0.145, green: 0.388, blue: 0.922, alpha: 1), // #2563EB
            secondaryButtonLabel: ShieldConfiguration.Label(
                text: "Unlock early",                              // starts the 60s panic-valve friction in-app
                color: .secondaryLabel
            )
        )
    }

    override func configuration(
        shielding application: Application,
        in category: ActivityCategory
    ) -> ShieldConfiguration {
        return configuration(shielding: application)
    }

    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
        // Reuse the same calm block-screen for shielded web domains.
        return ShieldConfiguration(
            backgroundBlurStyle: .systemMaterial,
            title: ShieldConfiguration.Label(text: "Locked until you start", color: .label),
            subtitle: ShieldConfiguration.Label(
                text: "Finish your first move in Ampora to unlock.",
                color: .secondaryLabel
            )
        )
    }

    override func configuration(
        shielding webDomain: WebDomain,
        in category: ActivityCategory
    ) -> ShieldConfiguration {
        return configuration(shielding: webDomain)
    }
}
