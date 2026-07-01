/**
 * Register Reanimated's animated components with NativeWind so `className`
 * works on them. Without this, NativeWind silently drops `className` on
 * <Animated.View> / <Animated.Text> / <Animated.ScrollView> (on web the classes
 * never resolve, collapsing layout/spacing/sizing). Imported once at the app
 * root, before anything renders.
 */
import { cssInterop } from "nativewind";
import Animated from "react-native-reanimated";

cssInterop(Animated.View, { className: "style" });
cssInterop(Animated.Text, { className: "style" });
cssInterop(Animated.ScrollView, { className: "style" });
