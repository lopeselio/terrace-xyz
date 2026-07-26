import { useFonts } from "expo-font";

// ---------------------------------------------------------------------------
// Barlow + Barlow Condensed (Google Fonts, OFL) — bundled, not fetched at
// runtime. Family keys match theme/tokens.ts `font`. Returns true once loaded;
// text falls back to the system face until then (no crash, just a brief swap).
// ---------------------------------------------------------------------------

export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    Barlow: require("../assets/fonts/Barlow-Regular.ttf"),
    "Barlow-Medium": require("../assets/fonts/Barlow-Medium.ttf"),
    "Barlow-SemiBold": require("../assets/fonts/Barlow-SemiBold.ttf"),
    "Barlow-Bold": require("../assets/fonts/Barlow-Bold.ttf"),
    "BarlowCondensed-SemiBold": require("../assets/fonts/BarlowCondensed-SemiBold.ttf"),
    "BarlowCondensed-Bold": require("../assets/fonts/BarlowCondensed-Bold.ttf"),
    "BarlowCondensed-ExtraBold": require("../assets/fonts/BarlowCondensed-ExtraBold.ttf"),
  });
  return loaded;
}
