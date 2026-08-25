import { useEffect } from "react";
import { Platform } from "react-native";

/**
 * Works around a web-only bug in the `react-native-css-interop` runtime that
 * NativeWind's `useColorScheme` is built on (confirmed by reading
 * `node_modules/react-native-css-interop/dist/runtime/web/color-scheme.js`,
 * this project's exact installed version — not guessed from docs).
 *
 * On web, calling `setColorScheme("system")` clears NativeWind's internal
 * override so the JS-readable `colorScheme` value correctly falls back to
 * the OS preference — but the SAME function's `<html>` class sync only ever
 * runs for an explicit `"dark"`/`"light"` value, never re-deriving the class
 * from the system preference for `"system"`. Net effect: every Tailwind
 * `dark:` class (which all resolve through that `<html>` class, per
 * `darkMode: "class"` in tailwind.config.js) stays stuck on light while
 * "System" is selected, no matter what the OS actually prefers, and stays
 * stuck even if the OS preference changes later while still in "system"
 * mode. The equivalent NATIVE path
 * (`runtime/native/appearance-observables.js`) has no such gap — iOS/Android
 * resolve "system" correctly through React Native's own `Appearance` module,
 * which has no DOM class to fall out of sync with. This hook is therefore a
 * web-only patch: a no-op on native, and a no-op whenever the user has
 * picked an explicit light/dark preference (matching how a real device
 * behaves — "System" tracks the OS, an explicit choice overrides it).
 *
 * Call once, near the root (`app/_layout.tsx`), passing the current
 * `settings.themePreference`.
 */
export function useWebSystemTheme(themePreference: "light" | "dark" | "system") {
  useEffect(() => {
    if (Platform.OS !== "web" || themePreference !== "system") return;
    if (typeof window === "undefined" || !window.matchMedia) return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyFromSystem = () => {
      document.documentElement.classList.toggle("dark", media.matches);
    };
    applyFromSystem();
    media.addEventListener("change", applyFromSystem);
    return () => media.removeEventListener("change", applyFromSystem);
  }, [themePreference]);
}
