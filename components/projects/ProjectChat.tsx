/**
 * ProjectChat — the project's scoped conversational interface (doc `10` §5). A
 * premium message list + composer. Sends through `services/aiProjects.projectChat`,
 * which degrades gracefully to a grounded templated reply when there's no key, so
 * the chat always responds; when a reply is a fallback we show a subtle "offline"
 * note under it (never a scary error).
 *
 * The chat is the project's primary controller and repair mechanism — this UI is
 * intentionally simple (ask/answer). Persistence of turns is the caller's job
 * (via `onSend`/`onReceive` into the store), so history survives navigation.
 */

import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { PROJECT_ACCENT } from "./projectUtils";
import { projectChat } from "@/services/aiProjects";
import { newId } from "@/core/id";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { iconSizes } from "@/utils/design-tokens";
import type { ChatMessage, Project } from "@/types";

interface ProjectChatProps {
  project: Project;
  /** Persist a new turn to the store. Called for both the user message and the reply. */
  onAppendMessage: (msg: ChatMessage) => void;
}

// A message may be flagged as a fallback reply for the subtle offline note.
type ViewMessage = ChatMessage & { isFallback?: boolean };

const SUGGESTIONS = [
  "What should I do today?",
  "I have less time this week, lighten the plan.",
  "Quiz me on the weakest topic.",
];

export function ProjectChat({ project, onAppendMessage }: ProjectChatProps) {
  const reduceMotion = useReduceMotion();
  const scrollRef = useRef<ScrollView>(null);

  // Local view of the conversation (seeded from the persisted history), plus a
  // per-message fallback flag we track only in the view.
  const [messages, setMessages] = useState<ViewMessage[]>(project.chat);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const body = raw.trim();
      if (!body || sending) return;

      const userMsg: ChatMessage = { id: newId(), role: "user", text: body, at: Date.now() };
      setMessages((prev) => [...prev, userMsg]);
      onAppendMessage(userMsg);
      setInput("");
      setSending(true);
      scrollToEnd();

      // aiProjects never throws — it always resolves with a reply (live or fallback).
      const result = await projectChat({ ...project, chat: [...project.chat, userMsg] }, body);
      const reply: ChatMessage = {
        id: newId(),
        role: "assistant",
        text: result.text,
        at: Date.now(),
      };
      setMessages((prev) => [...prev, { ...reply, isFallback: result.isFallback }]);
      onAppendMessage(reply);
      setSending(false);
      scrollToEnd();
    },
    [sending, project, onAppendMessage, scrollToEnd]
  );

  const hasMessages = messages.length > 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1"
    >
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ paddingVertical: 8, gap: 10 }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={scrollToEnd}
        keyboardShouldPersistTaps="handled"
      >
        {!hasMessages && (
          <View className="items-center py-8 px-4">
            <View
              className="w-14 h-14 rounded-full items-center justify-center mb-4"
              style={{ backgroundColor: PROJECT_ACCENT }}
            >
              <Ionicons name="chatbubbles-outline" size={iconSizes.lg} color="#FFFFFF" />
            </View>
            <Text className="text-body-lg font-semibold text-neutral-900 text-center">
              Talk to your project
            </Text>
            <Text className="text-body text-neutral-500 text-center mt-1.5 max-w-[300px]">
              Ask what to do next, change the plan, or get quizzed. This is how you steer the
              project — if something's off, just say so and it fixes it.
            </Text>
          </View>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={msg.id} msg={msg} reduceMotion={reduceMotion} index={i} />
        ))}

        {sending && (
          <View className="flex-row items-center self-start bg-neutral-100 rounded-2xl px-4 py-3 ml-1">
            <ActivityIndicator size="small" color={PROJECT_ACCENT} />
            <Text className="text-caption text-neutral-500 ml-2">Thinking…</Text>
          </View>
        )}
      </ScrollView>

      {/* Suggestion chips (only before the first message, to teach the interaction). */}
      {!hasMessages && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
        >
          {SUGGESTIONS.map((s) => (
            <Pressable
              key={s}
              onPress={() => send(s)}
              className="rounded-full border border-accent-600 bg-accent-100 px-3 py-2"
              accessibilityRole="button"
              accessibilityLabel={s}
            >
              <Text className="text-caption font-medium text-accent-700">{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Composer */}
      <View className="flex-row items-end gap-2 pt-2 pb-1">
        <View className="flex-1 flex-row items-center bg-white border border-neutral-200 rounded-2xl min-h-11 px-3 py-1">
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Message this project…"
            placeholderTextColor="#A1A1AA"
            className="flex-1 text-body text-neutral-900 max-h-24"
            multiline
            accessibilityLabel="Message this project"
            onSubmitEditing={() => send(input)}
          />
        </View>
        <Pressable
          onPress={() => send(input)}
          disabled={sending || input.trim().length === 0}
          className="w-11 h-11 rounded-full items-center justify-center"
          style={{
            backgroundColor: input.trim().length === 0 || sending ? "#E4E4E7" : PROJECT_ACCENT,
          }}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: sending || input.trim().length === 0 }}
        >
          <Ionicons name="arrow-up" size={iconSizes.md} color="#FFFFFF" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({
  msg,
  reduceMotion,
  index,
}: {
  msg: ViewMessage;
  reduceMotion: boolean;
  index: number;
}) {
  const isUser = msg.role === "user";
  const entering = reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base);

  return (
    <Animated.View
      entering={entering}
      className={isUser ? "items-end" : "items-start"}
      accessibilityLabel={`${isUser ? "You" : "Project"}: ${msg.text}`}
    >
      <View
        className={
          isUser
            ? "max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5"
            : "max-w-[90%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-neutral-100"
        }
        style={isUser ? { backgroundColor: PROJECT_ACCENT } : undefined}
      >
        <Text className={isUser ? "text-body text-white" : "text-body text-neutral-900"}>
          {msg.text}
        </Text>
      </View>
      {!isUser && msg.isFallback && (
        <View className="flex-row items-center mt-1 ml-1">
          <Ionicons name="cloud-offline-outline" size={iconSizes.xs} color="#A1A1AA" />
          <Text className="text-tiny text-neutral-400 ml-1">
            Offline — reconnect for a source-grounded reply.
          </Text>
        </View>
      )}
    </Animated.View>
  );
}
