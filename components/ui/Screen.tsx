import React from "react";
import { View, ScrollView, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { layout } from "@/utils/design-tokens";

interface ScreenProps {
  children: React.ReactNode;
  className?: string;
  /** Wrap content in a vertical ScrollView. @default false */
  scroll?: boolean;
  /** Apply horizontal screen padding (layout.screenPadX). @default true */
  padded?: boolean;
}

/**
 * Screen wrapper, bg-neutral-100 canvas + safe-area insets. Constrains
 * content to layout.maxContentWidth and centers it on wide (web) viewports so
 * lines never run edge-to-edge. Set `scroll` for long content, `padded={false}`
 * for full-bleed screens.
 */
export function Screen({
  children,
  className,
  scroll = false,
  padded = true,
}: ScreenProps) {
  const contentStyle: ViewStyle = {
    flex: scroll ? undefined : 1,
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center",
    paddingHorizontal: padded ? layout.screenPadX : 0,
  };

  const inner = <View style={contentStyle} className={className}>{children}</View>;

  return (
    <SafeAreaView className="flex-1 bg-neutral-100" edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}
