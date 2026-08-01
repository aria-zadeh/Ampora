import { Stack } from "expo-router";

/**
 * Onboarding stack (PRD §8.10). Screen order matches the 7-step flow (see the
 * numbering note atop `welcome.tsx` for why step 2 "Sign in" has no file
 * here): welcome -> name -> availability (scheduling hours) -> notifications
 * -> first-task (guided) -> aha (stake apps + one locked session).
 */
export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="name" />
      <Stack.Screen name="availability" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="first-task" />
      <Stack.Screen name="aha" />
    </Stack>
  );
}
