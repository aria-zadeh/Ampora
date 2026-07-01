/**
 * FileList — the project's persistent knowledge base UI (doc `10` §4). Lists the
 * files that stay in the project and lets the user add a text/note by pasting
 * content (which becomes `extractedText` and grounds the chat + task generation).
 * PDF/image attach is a device-only step in a later increment, so those show a
 * clear "attach on device" placeholder rather than a dead button.
 *
 * Each row shows the file name, a type badge, and a preview of the extracted
 * text so the user can see what the project actually understands.
 */

import React, { useCallback, useState } from "react";
import { View, Text, Pressable, TextInput, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PressableScale } from "@/components/ui/PressableScale";
import { Heading } from "@/components/ui/Heading";
import { newId } from "@/core/id";
import { iconSizes } from "@/utils/design-tokens";
import type { ProjectFile } from "@/types";

interface FileListProps {
  files: ProjectFile[];
  onAddFile: (file: ProjectFile) => void;
  onRemoveFile: (fileId: string) => void;
}

const TYPE_META: Record<ProjectFile["type"], { label: string; icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap }> = {
  text: { label: "Text", icon: "document-text-outline" },
  note: { label: "Note", icon: "create-outline" },
  pdf: { label: "PDF", icon: "document-outline" },
  image: { label: "Image", icon: "image-outline" },
};

export function FileList({ files, onAddFile, onRemoveFile }: FileListProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleAdd = useCallback(
    (name: string, text: string) => {
      const file: ProjectFile = {
        id: newId(),
        name,
        type: "note",
        extractedText: text,
        addedAt: Date.now(),
      };
      onAddFile(file);
      setSheetOpen(false);
    },
    [onAddFile]
  );

  return (
    <View>
      {files.length === 0 ? (
        <Card variant="flat" className="items-center py-6">
          <Ionicons name="folder-open-outline" size={iconSizes.xl} color="#A1A1AA" />
          <Text className="text-body text-neutral-500 text-center mt-2 max-w-[260px]">
            No files yet. Paste your notes, rubric, or study guide and the project will ground its
            help in your real material.
          </Text>
        </Card>
      ) : (
        <View className="gap-2.5">
          {files.map((file) => {
            const meta = TYPE_META[file.type];
            const preview = (file.extractedText ?? "").trim();
            return (
              <Card key={file.id} className="flex-row items-start">
                <View className="w-9 h-9 rounded-lg bg-neutral-100 items-center justify-center mt-0.5">
                  <Ionicons name={meta.icon} size={iconSizes.md} color="#71717A" />
                </View>
                <View className="flex-1 ml-3">
                  <View className="flex-row items-center gap-2">
                    <Text
                      className="flex-1 text-body font-semibold text-neutral-900"
                      numberOfLines={1}
                    >
                      {file.name}
                    </Text>
                    <Badge label={meta.label} tone="neutral" />
                  </View>
                  {preview.length > 0 ? (
                    <Text className="text-caption text-neutral-500 mt-1" numberOfLines={2}>
                      {preview}
                    </Text>
                  ) : (
                    <Text className="text-caption text-neutral-400 mt-1 italic">
                      Attach on device to extract text.
                    </Text>
                  )}
                </View>
                <Pressable
                  onPress={() => onRemoveFile(file.id)}
                  hitSlop={10}
                  className="ml-2 mt-0.5"
                  accessibilityLabel={`Remove file ${file.name}`}
                >
                  <Ionicons name="trash-outline" size={iconSizes.sm} color="#A1A1AA" />
                </Pressable>
              </Card>
            );
          })}
        </View>
      )}

      {/* Add actions */}
      <View className="flex-row gap-3 mt-4">
        <View className="flex-1">
          <Button
            title="Paste text"
            variant="secondary"
            onPress={() => setSheetOpen(true)}
            icon={<Ionicons name="clipboard-outline" size={iconSizes.sm} color="#18181B" />}
          />
        </View>
        <View className="flex-1">
          <Button
            title="Attach file"
            variant="ghost"
            onPress={() => setSheetOpen(true)}
            icon={<Ionicons name="attach-outline" size={iconSizes.sm} color="#2563EB" />}
          />
        </View>
      </View>
      <Text className="text-caption text-neutral-400 mt-2">
        PDF and image attach (with OCR) arrives with the on-device file picker. For now, paste the
        text you want the project to understand.
      </Text>

      <AddTextSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSave={handleAdd}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Paste-text sheet
// ---------------------------------------------------------------------------

function AddTextSheet({
  visible,
  onClose,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (name: string, text: string) => void;
}) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");

  React.useEffect(() => {
    if (visible) {
      setName("");
      setText("");
    }
  }, [visible]);

  const canSave = text.trim().length > 0;
  const finalName = name.trim() || "Pasted note";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40 justify-end" onPress={onClose} accessibilityLabel="Dismiss">
        <Pressable className="bg-white rounded-t-2xl p-5 pb-8" onPress={(e) => e.stopPropagation()}>
          <View className="items-center mb-4">
            <View className="w-10 h-1 rounded-full bg-neutral-200" />
          </View>
          <Heading size="h3">Paste text</Heading>
          <Text className="text-body text-neutral-500 mt-1 mb-5">
            Notes, a rubric, or study material. The project reads this to ground its answers and the
            sessions it plans.
          </Text>

          <View className="flex-row items-center bg-white border border-neutral-200 rounded-md min-h-12 px-3 mb-3">
            <Ionicons name="pricetag-outline" size={iconSizes.md} color="#A1A1AA" />
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="File name (optional)"
              placeholderTextColor="#A1A1AA"
              className="flex-1 ml-2 text-body-lg text-neutral-900"
              accessibilityLabel="File name"
            />
          </View>

          <View className="bg-white border border-neutral-200 rounded-md px-3 py-2.5 mb-6">
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Paste the content here…"
              placeholderTextColor="#A1A1AA"
              className="text-body text-neutral-900 min-h-[140px]"
              multiline
              textAlignVertical="top"
              autoFocus
              accessibilityLabel="Pasted content"
            />
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button title="Cancel" variant="secondary" onPress={onClose} />
            </View>
            <View className="flex-1">
              <Button
                title="Add file"
                variant="primaryBlue"
                disabled={!canSave}
                onPress={() => onSave(finalName, text.trim())}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
