/**
 * ProjectChat — the project's scoped conversational interface (doc `10` §5),
 * framed as a STUDY-PLAN PLANNER. It is where you steer the project: ask what to
 * do first, plan your week, lighten the load when time is short, or turn the
 * project into concrete next steps. A premium message list + composer.
 *
 * Sends through `services/aiProjects.projectChat`, which degrades gracefully to a
 * grounded templated reply when there's no key, so the chat always responds; a
 * fallback reply shows a subtle "offline" note (never a scary error).
 *
 * When a reply reads like a proposed plan (bulleted / numbered steps), we surface
 * an "Add these to my plan" affordance that creates a real Ampora Task per step,
 * linked to this project via `projectId` — so the plan becomes schedulable,
 * lockable work, not just chat. Persistence of turns is the caller's job (via
 * `onAppendMessage` into the store), so history survives navigation.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
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
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { PROJECT_ACCENT } from "./projectUtils";
import { projectChat } from "@/services/aiProjects";
import { useTaskStore } from "@/store/taskStore";
import { useProjectStore } from "@/store/projectStore";
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

// A message may be flagged as a fallback reply (for the subtle offline note) and
// may carry parsed plan steps (for the "Add these to my plan" affordance).
type ViewMessage = ChatMessage & { isFallback?: boolean; steps?: string[] };

// Planner-oriented starter prompts (doc `10` §5: the chat plans and repairs).
const SUGGESTIONS = [
  "What should I do first?",
  "Plan my week",
  "I have less time this week — lighten it",
  "Break this into steps",
];

// ---------------------------------------------------------------------------
// Plan-step parsing (graceful — used to offer "Add these to my plan")
// ---------------------------------------------------------------------------

/**
 * Pull actionable step lines out of an assistant reply. Recognises bulleted
 * (`-`, `•`, `*`) and numbered (`1.`, `2)`) lists. Kept deliberately simple and
 * defensive: if the structured shape isn't there we return [], and the affordance
 * just doesn't appear. Never throws.
 */
function parsePlanSteps(text: string): string[] {
  if (!text) return [];
  const steps: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // Bullet or numbered list markers at the start of a line.
    const m = line.match(/^(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (!m) continue;
    const body = m[1].trim().replace(/\s+/g, " ");
    // Skip empties and absurdly long paragraphs accidentally caught.
    if (body.length >= 2 && body.length <= 140) steps.push(body);
  }
  return steps.slice(0, 8); // doc 07: max 8 steps per breakdown
}

export function ProjectChat({ project, onAppendMessage }: ProjectChatProps) {
  const reduceMotion = useReduceMotion();
  const scrollRef = useRef<ScrollView>(null);

  // Local view of the conversation (seeded from the persisted history). We parse
  // plan steps out of any seeded assistant turns too, so the affordance survives
  // navigation for the most recent proposal.
  const [messages, setMessages] = useState<ViewMessage[]>(() =>
    project.chat.map((m) =>
      m.role === "assistant" ? { ...m, steps: parsePlanSteps(m.text) } : m
    )
  );
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [addedFor, setAddedFor] = useState<Record<string, boolean>>({});

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
      setMessages((prev) => [
        ...prev,
        { ...reply, isFallback: result.isFallback, steps: parsePlanSteps(result.text) },
      ]);
      onAppendMessage(reply);
      setSending(false);
      scrollToEnd();
    },
    [sending, project, onAppendMessage, scrollToEnd]
  );

  // Turn a proposed set of steps into real, schedulable Tasks linked to this
  // project (doc `10` §7: the project generates the Tasks the scheduler places).
  const addStepsToPlan = useCallback(
    (messageId: string, steps: string[]) => {
      if (steps.length === 0 || addedFor[messageId]) return;
      const { createTask } = useTaskStore.getState();
      const { linkTask } = useProjectStore.getState();
      for (const step of steps) {
        const task = createTask({
          title: step,
          projectId: project.id,
          autoSchedule: true,
        });
        linkTask(project.id, task.id);
      }
      setAddedFor((prev) => ({ ...prev, [messageId]: true }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
    [project.id, addedFor]
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
              <Ionicons name="map-outline" size={iconSizes.lg} color="#FFFFFF" />
            </View>
            <Text className="text-body-lg font-semibold text-neutral-900 text-center">
              Plan this project
            </Text>
            <Text className="text-body text-neutral-500 text-center mt-1.5 max-w-[300px]">
              Ask what to do first, plan your week, or lighten the load when you&apos;re short on
              time. Say the word and it breaks the project into steps you can schedule.
            </Text>
          </View>
        )}

        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            reduceMotion={reduceMotion}
            index={i}
            added={!!addedFor[msg.id]}
            onAddSteps={addStepsToPlan}
          />
        ))}

        {sending && (
          <View className="flex-row items-center self-start bg-neutral-100 rounded-2xl px-4 py-3 ml-1">
            <ActivityIndicator size="small" color={PROJECT_ACCENT} />
            <Text className="text-caption text-neutral-500 ml-2">Thinking…</Text>
          </View>
        )}
      </ScrollView>

      {/* Suggestion chips (only before the first message, to teach the interaction).
          Each chip is width-constrained and single-line so it renders as a neat
          pill that scrolls horizontally, instead of a giant overlapping oval. */}
      {!hasMessages && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // flexGrow/flexShrink 0 stops the row from stretching to fill the
          // column; alignItems center lets each chip take its natural (one-line)
          // height instead of being stretched into a tall oval by the default
          // cross-axis `stretch`. Without these, rounded-full renders as a giant
          // overlapping ellipse on web.
          style={{ flexGrow: 0, flexShrink: 0 }}
          contentContainerStyle={{
            gap: 8,
            paddingHorizontal: 4,
            paddingVertical: 8,
            alignItems: "center",
          }}
        >
          {SUGGESTIONS.map((s) => (
            <Pressable
              key={s}
              onPress={() => send(s)}
              style={{ flexShrink: 0, alignSelf: "center", maxWidth: 240 }}
              className="rounded-full border border-accent-600 bg-accent-100 px-3.5 py-2"
              accessibilityRole="button"
              accessibilityLabel={s}
            >
              <Text className="text-caption font-medium text-accent-700" numberOfLines={1}>
                {s}
              </Text>
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
            placeholder="Plan with this project…"
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
  added,
  onAddSteps,
}: {
  msg: ViewMessage;
  reduceMotion: boolean;
  index: number;
  added: boolean;
  onAddSteps: (messageId: string, steps: string[]) => void;
}) {
  const isUser = msg.role === "user";
  const entering = reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base);
  const steps = useMemo(() => msg.steps ?? [], [msg.steps]);
  const showAdd = !isUser && steps.length > 0;

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

      {/* "Add these to my plan" — turns a proposed plan into real linked Tasks. */}
      {showAdd && (
        <Pressable
          onPress={() => onAddSteps(msg.id, steps)}
          disabled={added}
          className={`flex-row items-center self-start mt-2 ml-1 rounded-full px-3.5 py-2 ${
            added ? "bg-success-100" : "bg-accent-100 border border-accent-600"
          }`}
          accessibilityRole="button"
          accessibilityLabel={
            added
              ? `Added ${steps.length} steps to your plan`
              : `Add ${steps.length} ${steps.length === 1 ? "step" : "steps"} to your plan`
          }
          accessibilityState={{ disabled: added }}
        >
          <Ionicons
            name={added ? "checkmark-circle" : "add-circle-outline"}
            size={iconSizes.sm}
            color={added ? "#15803D" : "#6D28D9"}
          />
          <Text
            className={`text-caption font-semibold ml-1.5 ${
              added ? "text-success-700" : "text-accent-700"
            }`}
          >
            {added
              ? `Added ${steps.length} to your plan`
              : `Add ${steps.length} ${steps.length === 1 ? "step" : "steps"} to my plan`}
          </Text>
        </Pressable>
      )}

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
