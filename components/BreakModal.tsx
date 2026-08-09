import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, Modal, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "./ui/Button";
import { TimerDisplay } from "./ui/TimerDisplay";

interface BreakModalProps {
  visible: boolean;
  onClose: () => void;
  defaultMinutes?: number;
}

const CALMING_PROMPTS = [
  { icon: "cloudy-outline" as const, text: "Take 5 deep breaths. In through your nose, out through your mouth." },
  { icon: "body-outline" as const, text: "Stand up and stretch. Roll your shoulders back. Shake out your hands." },
  { icon: "eye-outline" as const, text: "Look away from the screen. Find something green and focus on it for 20 seconds." },
];

const DEFAULT_BREAK_SECONDS = 300; // 5 minutes
const SKIP_UNLOCK_SECONDS = 60;    // "Skip" appears after 60 s elapsed

export function BreakModal({
  visible,
  onClose,
  defaultMinutes = 5,
}: BreakModalProps) {
  const totalSeconds = defaultMinutes * 60;
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [isRunning, setIsRunning] = useState(true);
  // Elapsed seconds since the break started (used to unlock the Skip button)
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [prompt] = useState(
    () => CALMING_PROMPTS[Math.floor(Math.random() * CALMING_PROMPTS.length)]
  );
  const hasAutoClosedRef = useRef(false);

  // Reset state whenever the modal opens
  useEffect(() => {
    if (visible) {
      setSecondsLeft(totalSeconds);
      setElapsedSeconds(0);
      setIsRunning(true);
      hasAutoClosedRef.current = false;
    }
  }, [visible, totalSeconds]);

  // Break countdown + elapsed tracker
  useEffect(() => {
    if (!isRunning || !visible) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          return 0;
        }
        return prev - 1;
      });
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRunning, visible]);

  // Auto-close when timer reaches 0
  useEffect(() => {
    if (secondsLeft === 0 && visible && !hasAutoClosedRef.current) {
      hasAutoClosedRef.current = true;
      onClose();
    }
  }, [secondsLeft, visible, onClose]);

  const handleResume = useCallback(() => {
    onClose();
  }, [onClose]);

  const canSkip = elapsedSeconds >= SKIP_UNLOCK_SECONDS;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <View className="flex-1 bg-surface dark:bg-surface-dark justify-center items-center px-8">
        {/* Calming icon */}
        <View className="w-20 h-20 rounded-full bg-accent-light dark:bg-accent/15 items-center justify-center mb-6">
          <Ionicons name={prompt.icon} size={40} className="text-accent dark:text-accent" />
        </View>

        {/* Title */}
        <Text className="text-title font-semibold text-content dark:text-content-dark-primary text-center mb-3">
          Take a breather
        </Text>

        {/* Calming prompt */}
        <Text className="text-body text-content-secondary dark:text-content-dark-secondary text-center mb-8 leading-6 max-w-[280px]">
          {prompt.text}
        </Text>

        {/* Countdown timer */}
        <View className="mb-10">
          <TimerDisplay
            seconds={secondsLeft}
            running={isRunning}
            label="Time remaining"
          />
        </View>

        {/* Actions */}
        <View className="w-full gap-3">
          {/* Resume, ALWAYS visible, 52pt primary action */}
          <Pressable
            onPress={handleResume}
            className="w-full min-h-[52px] flex-row items-center justify-center bg-primary active:bg-primary-dark rounded-lg px-6"
            accessibilityRole="button"
            accessibilityLabel="Resume focus session"
          >
            <Ionicons name="arrow-forward-circle-outline" size={20} className="text-primary-foreground" />
            <Text className="text-body font-semibold text-primary-foreground ml-2">
              Resume
            </Text>
          </Pressable>

          {/* Skip, appears only after 60 seconds have elapsed */}
          {canSkip && (
            <Pressable
              onPress={handleResume}
              className="w-full min-h-[44px] flex-row items-center justify-center bg-surface-elevated dark:bg-surface-dark-elevated border border-border dark:border-border-dark rounded-lg px-6"
              accessibilityRole="button"
              accessibilityLabel="Skip remaining break time"
            >
              <Text className="text-caption font-medium text-content-secondary dark:text-content-dark-secondary">
                Skip remaining time
              </Text>
            </Pressable>
          )}

          {/* Pause / unpause the break timer */}
          <Pressable
            onPress={() => setIsRunning((r) => !r)}
            className="min-h-[44px] items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel={isRunning ? "Pause break timer" : "Resume break timer"}
          >
            <Text className="text-caption text-content-muted dark:text-content-dark-muted">
              {isRunning ? "Pause timer" : "Unpause timer"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
