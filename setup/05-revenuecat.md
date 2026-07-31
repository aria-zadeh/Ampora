# RevenueCat: real subscriptions

Not urgent. Nothing else in the app depends on this working yet, the paywall already runs fine on placeholder prices. Do this whenever, after the paid Apple Developer account from `01-apple.md` exists (the first step below needs it).

## What RevenueCat is, and why it is there at all

Apple's real in-app purchase system (StoreKit) is low-level and easy to get wrong: verifying a receipt, handling restores, and checking "is this person currently paying" all take real work to do safely. RevenueCat sits in between: it talks to Apple's (and later Google's) purchase systems directly, and Ampora just asks it one simple question, whether a person has an active subscription right now.

## Step 1: App Store Connect

1. Under the app record for `com.ampora.app`, find **Subscriptions** in the sidebar (Apple has moved this around between "Features" and "Monetization" over the years, check both if it is not where expected).
2. Create **one subscription group**, something like "Ampora Premium." One group means monthly and annual plans can be switched between each other rather than treated as unrelated purchases.
3. Add **two products** to that group: a monthly plan and an annual plan. The product ID text itself can be anything, the app never hardcodes a specific one (RevenueCat matches by billing period instead, see Step 2). Set pricing and a localized name and description for each, then submit them.
4. **Do not also turn on an Apple introductory free trial on these products.** Ampora's 14-day trial already happens entirely inside the app (`core/subscription.ts`), before StoreKit or RevenueCat ever get involved. Adding a second, store-side trial on top would create two separate trial mechanics the app was never built to reconcile.
5. Create at least one **Sandbox Tester**: **Users and Access**, **Sandbox**, **Testers**, add one. A fake email address is fine, it never needs to receive real mail. This is what allows buying the subscription later for testing without spending real money.

## Step 2: RevenueCat (app.revenuecat.com)

1. Create a project for Ampora if one does not exist yet.
2. Connect the App Store Connect app: RevenueCat needs the **App-Specific Shared Secret**, found in App Store Connect under **App Information** on the app's page. Paste it into RevenueCat's app connection settings.
3. Open **Product catalog**, the **Entitlements** tab, click **+ New entitlement**.

   **The identifier must be exactly `premium`, lowercase, nothing added.** This exact string is hardcoded in the app's code (`core/iap/NativePurchaseStrategy.ts`, the `ENTITLEMENT_ID` constant). If the name here does not match exactly, here is what actually happens: **a purchase still succeeds, real money still changes hands, and the app never unlocks anyway.** The paywall keeps showing a paying customer the "subscribe" screen, forever, and everything about the purchase flow looks completely normal while it is happening. This is the single easiest mistake to make in this whole file and the hardest one to notice once made, double check the spelling before moving on.

4. Open **Product catalog**, **Products**, **+ New**, once for each of the two App Store Connect products from Step 1. Select the app, enter the product's identifier, create it.
5. On the `premium` entitlement, use **Attach** under Associated Products to attach both products to it.
6. Open **Offerings**, create an Offering, mark it **current** (the default one customers see), add two **Packages** to it, one per product.

   RevenueCat figures out which package is monthly and which is annual from each product's actual billing period in App Store Connect, not from any naming convention. The literal product ID text from Step 1 does not need to match anything here or in the app's code, only the billing periods need to be correct: one monthly, one annual.

7. Copy the **Public API Key** for the Apple App Store: **Project Settings**, **API Keys**, the one that starts with `appl_`.

## Step 3: put the key in `.env`

On the Mac, in the repo's `.env` file:
```
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_...
```
This is a publishable-style key, like a Stripe publishable key, safe to ship inside the app bundle. Still keep it out of git and out of chat, same as every other key in this repo.

## If the entitlement name is ever wrong

Worth restating plainly, since it is the one failure mode in this whole setup that is nearly invisible: if the RevenueCat entitlement is not named exactly `premium`, purchases keep succeeding and money keeps changing hands, but the app never unlocks for the person who paid. Fix it one of two ways: rename the entitlement in RevenueCat's dashboard to exactly `premium`, or edit the `ENTITLEMENT_ID` constant in `core/iap/NativePurchaseStrategy.ts` to match whatever it is actually named. Renaming the dashboard entitlement is simpler and does not touch code.

## Android

Out of scope for this pass, on purpose. The current code only reads an iOS RevenueCat key. Play Console setup and a second RevenueCat platform key are separate future work, matching how the app-lock feature is iOS-only for now too.

## Testing it

Uses the same dev-client build process as `04-test-the-lock.md`. To test subscriptions on their own, without the app lock, run `npm run native:on -- purchases` instead of the plain version, then follow `04-test-the-lock.md` from step 3 onward (typecheck, prebuild, the two pre-flight checks do not apply here since they are Ignition-specific, EAS build, install). Unlike the app lock, this one does need a real package installed: when the toggle command prints a `react-native-purchases` line, install it with `npx expo install react-native-purchases` rather than typing a version number by hand, since `expo install` automatically picks the version that matches the installed Expo SDK. The version currently pinned in `native/package-additions.json`'s `purchases` group was recorded from a machine that cannot run that install command itself, so treat it as a starting point to double check, not a guarantee.

Once the app is running on the phone:

- [ ] Open the paywall. When the StoreKit purchase sheet appears, sign in with the **Sandbox Tester** Apple ID from Step 1, not a real Apple ID.
- [ ] **Pass:** the plan cards show real App Store prices. Placeholder prices ($6.99 / $74.99) instead mean the real offering failed to load, something upstream in this file is not finished yet.
- [ ] Buy the monthly plan. **Pass:** the app proceeds past the paywall into the normal app, and Settings shows an active subscription.
- [ ] Force-quit the app and reopen it. **Pass:** the paywall does not show again, the subscription is remembered.
- [ ] From the paywall (may need to sign out, or reset the sandbox tester's purchase history in App Store Connect first), tap **Restore purchases**. **Pass:** it recognizes the existing subscription and unlocks without a second charge.
- [ ] Dismiss the StoreKit sheet partway through a purchase instead of completing it. **Pass:** the app calmly returns to the paywall, no crash, no scary error.
- [ ] Force a purchase to fail for an unrelated reason if possible (airplane mode is the easiest way). **Pass:** a plain "That didn't go through. Please try again." message, never a crash.
