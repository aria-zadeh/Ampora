/**
 * FileList — the project's persistent knowledge base UI (doc `10` §4). Lists the
 * files that stay in the project and lets the user add material three ways:
 *  - Attach file — a REAL picker: on native, expo-document-picker (PDF / docs /
 *    spreadsheets) plus an option to pick a photo/diagram via expo-image-picker;
 *    on web the document picker's own <input type="file"> handles all of it.
 *  - Paste text — notes / rubric / study guide pasted inline (becomes
 *    `extractedText` and grounds the chat + task generation).
 *
 * We store the picked file's `uri` and set `type` from its mime. Text is only
 * extracted when it's trivially available (a plain-text file we can read as a
 * string); real OCR/PDF extraction is an honest "coming later". Every picker
 * call is wrapped in try/catch so an unsupported platform (or a cancelled /
 * denied pick) never crashes — it just no-ops or degrades.
 *
 * Each row shows the file name, a type badge, and a preview of the extracted
 * text so the user can see what the project actually understands.
 */

import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  Modal,
  Platform,
  type GestureResponderEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
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

// Project file limits (audit gap — doc `10` §4 default caps). Enforced here in
// the add path so a project's knowledge base stays a bounded, groundable set
// rather than growing unbounded.
const MAX_FILES = 20;
const MAX_FILE_MB = 25;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

// Accepted document-picker MIME filter: pdf / image / doc / sheet, plus plain
// text (kept — it is how pasted-style notes get real text extraction today).
const ACCEPTED_DOCUMENT_TYPES = [
  "application/pdf",
  "image/*",
  "text/*",
  // Word-style documents
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // Spreadsheets
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
];

/** File extensions accepted as a fallback check when mimeType is missing/generic. */
const ACCEPTED_EXTENSIONS = /\.(pdf|png|jpe?g|gif|webp|heic|heif|bmp|doc|docx|xls|xlsx|csv|txt|md)$/i;

/** Whether a picked asset's mime/name matches an accepted category (pdf/img/doc/sheet/text). */
function isAcceptedFileType(mime: string | undefined, name: string): boolean {
  const m = (mime ?? "").toLowerCase();
  if (
    m.startsWith("image/") ||
    m.startsWith("text/") ||
    m === "application/pdf" ||
    m === "application/msword" ||
    m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    m === "application/vnd.ms-excel" ||
    m === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return true;
  }
  return ACCEPTED_EXTENSIONS.test(name.toLowerCase());
}

const TYPE_META: Record<
  ProjectFile["type"],
  { label: string; icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap }
> = {
  text: { label: "Text", icon: "document-text-outline" },
  note: { label: "Note", icon: "create-outline" },
  pdf: { label: "PDF", icon: "document-outline" },
  image: { label: "Image", icon: "image-outline" },
};

/** Map a mime type / filename to the project file's coarse `type`. */
function fileTypeFromMime(mime: string | undefined, name: string): ProjectFile["type"] {
  const m = (mime ?? "").toLowerCase();
  const n = name.toLowerCase();
  if (m.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/.test(n)) return "image";
  if (m === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (m.startsWith("text/") || /\.(txt|md|csv)$/.test(n)) return "text";
  // Docs / slides / spreadsheets: no trivial text extraction, keep as a generic
  // document — surfaced with the PDF-style "document" glyph.
  return "pdf";
}

/**
 * Best-effort trivial text extraction: only for genuinely plain-text files that
 * we can read as a string without any parser. Everything else returns undefined
 * (OCR / PDF / docx extraction is a later increment — kept honest in the UI).
 */
async function extractTrivialText(
  asset: { uri: string; mimeType?: string; name: string; file?: File }
): Promise<string | undefined> {
  const type = fileTypeFromMime(asset.mimeType, asset.name);
  if (type !== "text") return undefined;
  try {
    // Web gives us a File handle directly; native gives a uri we can fetch.
    if (Platform.OS === "web" && asset.file && typeof asset.file.text === "function") {
      const t = await asset.file.text();
      return t.trim() || undefined;
    }
    const res = await fetch(asset.uri);
    const t = await res.text();
    return t.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function FileList({ files, onAddFile, onRemoveFile }: FileListProps) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [attaching, setAttaching] = useState(false);
  // Calm inline limit error (file count / size / type) — cleared on the next
  // successful add or user retry, never an alert/"Oops!" popup.
  const [limitError, setLimitError] = useState<string | null>(null);

  const atFileLimit = files.length >= MAX_FILES;

  const handleAddText = useCallback(
    (name: string, text: string) => {
      if (files.length >= MAX_FILES) {
        setLimitError(`This project already has ${MAX_FILES} files, the most it can hold at once.`);
        return;
      }
      const file: ProjectFile = {
        id: newId(),
        name,
        type: "note",
        extractedText: text,
        addedAt: Date.now(),
      };
      onAddFile(file);
      setLimitError(null);
      setPasteOpen(false);
    },
    [files.length, onAddFile]
  );

  /** Pick a document (PDF / image / doc / spreadsheet / text). Guarded. */
  const pickDocument = useCallback(async () => {
    if (attaching) return;
    if (files.length >= MAX_FILES) {
      setLimitError(`This project already has ${MAX_FILES} files, the most it can hold at once.`);
      return;
    }
    setAttaching(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ACCEPTED_DOCUMENT_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const name = asset.name || "Attachment";

        if (!isAcceptedFileType(asset.mimeType, name)) {
          setLimitError("That file type isn't supported yet — try a PDF, image, document, or spreadsheet.");
          return;
        }
        if (asset.size != null && asset.size > MAX_FILE_BYTES) {
          setLimitError(`"${name}" is over the ${MAX_FILE_MB} MB limit for a single file.`);
          return;
        }

        const extractedText = await extractTrivialText({
          uri: asset.uri,
          mimeType: asset.mimeType,
          name: asset.name,
          file: asset.file,
        });
        onAddFile({
          id: newId(),
          name,
          type: fileTypeFromMime(asset.mimeType, name),
          uri: asset.uri,
          extractedText,
          addedAt: Date.now(),
        });
        setLimitError(null);
      }
    } catch {
      // Unsupported / denied / cancelled — never crash, just stop.
    } finally {
      setAttaching(false);
    }
  }, [attaching, files.length, onAddFile]);

  /** Pick a photo/diagram from the library (native-focused). Guarded. */
  const pickImage = useCallback(async () => {
    if (attaching) return;
    if (files.length >= MAX_FILES) {
      setLimitError(`This project already has ${MAX_FILES} files, the most it can hold at once.`);
      return;
    }
    setAttaching(true);
    try {
      // Permission is a no-op on web; guard it so a throw doesn't block the pick.
      try {
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      } catch {
        // ignore — launch still works on platforms that don't require it
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const name = asset.fileName || `Image ${new Date().toLocaleDateString()}`;

        if (asset.fileSize != null && asset.fileSize > MAX_FILE_BYTES) {
          setLimitError(`"${name}" is over the ${MAX_FILE_MB} MB limit for a single file.`);
          return;
        }

        onAddFile({
          id: newId(),
          name,
          type: "image",
          uri: asset.uri,
          addedAt: Date.now(),
        });
        setLimitError(null);
      }
    } catch {
      // Unsupported / denied / cancelled — never crash.
    } finally {
      setAttaching(false);
    }
  }, [attaching, files.length, onAddFile]);

  return (
    <View>
      {files.length === 0 ? (
        <Card variant="flat" className="items-center py-6">
          <Ionicons name="folder-open-outline" size={iconSizes.xl} color="#A8A29A" />
          <Text className="text-body text-neutral-500 text-center mt-2 max-w-[260px]">
            No files yet. Attach a PDF, notes, or a photo — or paste text — and the project will
            ground its help in your real material.
          </Text>
        </Card>
      ) : (
        <View className="gap-2.5">
          {files.map((file) => {
            const meta = TYPE_META[file.type];
            const preview = (file.extractedText ?? "").trim();
            const hasFileBytes = !!file.uri;
            return (
              <Card key={file.id} className="flex-row items-start">
                <View className="w-9 h-9 rounded-lg bg-neutral-100 items-center justify-center mt-0.5">
                  <Ionicons name={meta.icon} size={iconSizes.md} color="#6F6862" />
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
                  ) : hasFileBytes ? (
                    <Text className="text-caption text-neutral-500 mt-1 italic">
                      Attached · text extraction coming later.
                    </Text>
                  ) : (
                    <Text className="text-caption text-neutral-500 mt-1 italic">
                      No text yet.
                    </Text>
                  )}
                </View>
                <Pressable
                  onPress={() => onRemoveFile(file.id)}
                  hitSlop={10}
                  className="ml-2 mt-0.5"
                  accessibilityRole="button"
                  accessibilityLabel={`Remove file ${file.name}`}
                >
                  <Ionicons name="trash-outline" size={iconSizes.sm} color="#A8A29A" />
                </Pressable>
              </Card>
            );
          })}
        </View>
      )}

      {/* Calm inline limit error — file count, size, or type. Never an alert. */}
      {limitError ? (
        <View className="flex-row items-start gap-2 rounded-lg border border-warning-100 bg-warning-100/50 p-3 mt-4">
          <Ionicons name="information-circle-outline" size={iconSizes.sm} color="#C2410C" />
          <Text className="flex-1 text-caption text-warning-700">{limitError}</Text>
        </View>
      ) : null}

      {/* Add actions */}
      <View className="flex-row gap-3 mt-4">
        <View className="flex-1">
          <Button
            title="Attach file"
            variant="secondary"
            loading={attaching}
            disabled={atFileLimit}
            onPress={pickDocument}
            icon={<Ionicons name="document-attach-outline" size={iconSizes.sm} color="#1C1917" />}
          />
        </View>
        <View className="flex-1">
          <Button
            title="Paste text"
            variant="ghost"
            disabled={atFileLimit}
            onPress={() => setPasteOpen(true)}
            icon={<Ionicons name="clipboard-outline" size={iconSizes.sm} color="#2563EB" />}
          />
        </View>
      </View>

      {/* Photo/diagram is native-focused; on web the document picker already
          accepts images, so we only surface the extra entry point off-web. */}
      {Platform.OS !== "web" && (
        <Pressable
          onPress={pickImage}
          disabled={attaching || atFileLimit}
          className="flex-row items-center justify-center mt-3 py-2"
          accessibilityRole="button"
          accessibilityLabel="Add a photo or diagram"
          accessibilityState={{ disabled: attaching || atFileLimit }}
        >
          <Ionicons
            name="image-outline"
            size={iconSizes.sm}
            color={atFileLimit ? "#A8A29A" : "#2563EB"}
          />
          <Text
            className={`text-label font-medium ml-1.5 ${
              atFileLimit ? "text-neutral-500" : "text-primary-600"
            }`}
          >
            Add a photo or diagram
          </Text>
        </Pressable>
      )}

      <Text className="text-caption text-neutral-500 mt-2">
        {atFileLimit
          ? `This project is at its ${MAX_FILES}-file limit. Remove one to add another.`
          : `Attach PDFs, docs, photos, or spreadsheets (up to ${MAX_FILE_MB} MB each, ${MAX_FILES} files per project), or paste text directly. Plain-text files are read now; full OCR and PDF text extraction arrive in a later update.`}
      </Text>

      <AddTextSheet visible={pasteOpen} onClose={() => setPasteOpen(false)} onSave={handleAddText} />
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

  // Same web-safe guard as NewProjectSheet: only dismiss on a real backdrop tap,
  // never on a Space/Enter keypress that bubbles from a focused child input.
  const handleBackdropPress = useCallback(
    (e: GestureResponderEvent) => {
      const native = e?.nativeEvent as unknown as
        | { target?: unknown; currentTarget?: unknown }
        | undefined;
      const target = native?.target ?? (e as unknown as { target?: unknown })?.target;
      const currentTarget =
        native?.currentTarget ?? (e as unknown as { currentTarget?: unknown })?.currentTarget;
      if (target != null && currentTarget != null && target !== currentTarget) return;
      onClose();
    },
    [onClose]
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        className="flex-1 bg-black/40 justify-end"
        onPress={handleBackdropPress}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <Pressable
          className="bg-white rounded-t-2xl p-5 pb-8"
          onPress={(e) => e.stopPropagation()}
          onStartShouldSetResponder={() => true}
        >
          <View className="items-center mb-4">
            <View className="w-10 h-1 rounded-full bg-neutral-200" />
          </View>
          <Heading size="h3">Paste text</Heading>
          <Text className="text-body text-neutral-500 mt-1 mb-5">
            Notes, a rubric, or study material. The project reads this to ground its answers and the
            sessions it plans.
          </Text>

          <View className="flex-row items-center bg-white border border-neutral-200 rounded-md min-h-12 px-3 mb-3">
            <Ionicons name="pricetag-outline" size={iconSizes.md} color="#A8A29A" />
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="File name (optional)"
              placeholderTextColor="#A8A29A"
              className="flex-1 ml-2 text-body-lg text-neutral-900"
              accessibilityLabel="File name"
            />
          </View>

          <View className="bg-white border border-neutral-200 rounded-md px-3 py-2.5 mb-6">
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Paste the content here…"
              placeholderTextColor="#A8A29A"
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
