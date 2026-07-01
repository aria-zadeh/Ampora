import React from "react";
import {
  Pressable,
  Text,
  ActivityIndicator,
  type PressableProps,
} from "react-native";

type ButtonVariant =
  | "primary"
  | "primaryBlue"
  | "secondary"
  | "ghost"
  | "destructive"
  | "success";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends Omit<PressableProps, "children"> {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, { base: string; text: string }> = {
  primary: {
    base: "bg-neutral-900",
    text: "text-white",
  },
  primaryBlue: {
    base: "bg-primary-600",
    text: "text-white",
  },
  secondary: {
    base: "bg-white border border-neutral-200",
    text: "text-neutral-900",
  },
  ghost: {
    base: "bg-transparent",
    text: "text-primary-600",
  },
  destructive: {
    base: "bg-danger-600",
    text: "text-white",
  },
  success: {
    base: "bg-success-700",
    text: "text-white",
  },
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-[36px] px-4",
  md: "min-h-[44px] px-5",
  lg: "min-h-[52px] px-6",
};

const LIGHT_TEXT_VARIANTS: ButtonVariant[] = [
  "primary",
  "primaryBlue",
  "destructive",
  "success",
];

export function Button({
  title,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  icon,
  ...props
}: ButtonProps) {
  const styles = variantClasses[variant];
  const isDisabled = disabled || loading;
  const usesLightText = LIGHT_TEXT_VARIANTS.includes(variant);

  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      className={`flex-row items-center justify-center rounded-md ${sizeClasses[size]} ${styles.base} ${isDisabled ? "opacity-50" : ""}`}
      style={({ pressed }) => [
        pressed ? { opacity: isDisabled ? 0.5 : 0.85 } : null,
        typeof props.style === "function" ? undefined : props.style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={props.accessibilityLabel || title}
    >
      {loading ? (
        <ActivityIndicator
          color={usesLightText ? "#FFFFFF" : "#18181B"}
          className="mr-2"
        />
      ) : icon ? (
        <>{icon}</>
      ) : null}
      <Text
        className={`text-label font-semibold ${styles.text} ${icon || loading ? "ml-2" : ""}`}
      >
        {title}
      </Text>
    </Pressable>
  );
}
