import React from "react";
import { View, Pressable, type ViewProps, type PressableProps } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type CardVariant = "default" | "elevated" | "flat";

interface CardBaseProps {
  variant?: CardVariant;
  children: React.ReactNode;
  className?: string;
}

interface TappableCardProps extends CardBaseProps, Omit<PressableProps, "children" | "className"> {
  onPress: PressableProps["onPress"];
}

interface StaticCardProps extends CardBaseProps, Omit<ViewProps, "children" | "className"> {
  onPress?: never;
}

type CardProps = TappableCardProps | StaticCardProps;

const variantClasses: Record<CardVariant, string> = {
  default: "bg-white border border-neutral-200 rounded-lg shadow-sm p-4",
  elevated: "bg-white border border-neutral-200 rounded-lg shadow-md p-4",
  flat: "bg-neutral-50 rounded-lg p-4",
};

function TappableCard({ variant = "default", children, onPress, className = "", ...props }: TappableCardProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 15, stiffness: 200 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 12, stiffness: 180 });
      }}
      className={`${variantClasses[variant]} ${className}`}
      accessibilityRole="button"
      style={animatedStyle}
      {...(props as PressableProps)}
    >
      {children}
    </AnimatedPressable>
  );
}

export function Card({ variant = "default", children, onPress, className = "", ...props }: CardProps) {
  const classes = `${variantClasses[variant]} ${className}`;

  if (onPress) {
    return (
      <TappableCard variant={variant} onPress={onPress} className={className} {...(props as PressableProps)}>
        {children}
      </TappableCard>
    );
  }

  return (
    <View className={classes} {...(props as ViewProps)}>
      {children}
    </View>
  );
}
