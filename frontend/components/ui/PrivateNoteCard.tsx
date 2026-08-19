/**
 * PrivateNoteCard — a standing, private-to-the-viewer note about a movie/
 * theatre/screen (never shown to anyone else — same idea as a Discord
 * profile note). Auto-saves on blur; clearing the text deletes the note
 * server-side rather than PUTting an empty string, matching the backend's
 * own note hooks (useMovieNote/useTheatreNote/useScreenNote in
 * useSearch.ts already do the delete-when-empty translation).
 */
import React, { useEffect, useState } from "react";
import { Platform, Text, TextInput, View } from "react-native";
import { NotePencil } from "phosphor-react-native";
import { useTheme } from "../../hooks/useTheme";
import type { VenueNote } from "../../types";

export function PrivateNoteCard({ note, loading, onSave, saving }: {
  note: VenueNote | null | undefined;
  loading: boolean;
  onSave: (text: string) => void;
  saving: boolean;
}) {
  const { theme } = useTheme();
  const [draft, setDraft] = useState(note?.note ?? "");
  const [dirty, setDirty] = useState(false);

  // Only overwrite the draft from server data when the viewer hasn't
  // started typing — otherwise a background refetch (e.g. from the
  // mutation's own onSuccess priming the cache) would stomp over
  // whatever's mid-edit.
  useEffect(() => {
    if (!dirty) setDraft(note?.note ?? "");
  }, [note, dirty]);

  const commit = () => {
    if (!dirty) return;
    setDirty(false);
    onSave(draft);
  };

  if (loading) return null;

  const placeholder = "Private note — only you can see this…";

  if (Platform.OS === "web") {
    return (
      <div className="card" style={{ marginBottom: 20 } as React.CSSProperties}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 } as React.CSSProperties}>
          <NotePencil size={14} color={`${theme.text}88`} />
          <span style={{ fontSize: 12, fontWeight: 600, color: `${theme.text}88`, letterSpacing: 0.3 } as React.CSSProperties}>
            PRIVATE NOTE
          </span>
          {saving && <span style={{ fontSize: 11, color: `${theme.text}55` } as React.CSSProperties}>Saving…</span>}
        </div>
        <textarea
          className="input"
          value={draft}
          placeholder={placeholder}
          onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
          onBlur={commit}
          rows={2}
          style={{ width: "100%", resize: "vertical", minHeight: 44 } as React.CSSProperties}
        />
      </div>
    );
  }

  return (
    <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 14, marginBottom: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <NotePencil size={14} color={`${theme.text}88`} />
        <Text style={{ fontSize: 12, fontWeight: "600", color: `${theme.text}88`, letterSpacing: 0.3 }}>PRIVATE NOTE</Text>
        {saving && <Text style={{ fontSize: 11, color: `${theme.text}55`, marginLeft: "auto" }}>Saving…</Text>}
      </View>
      <TextInput
        value={draft}
        placeholder={placeholder}
        placeholderTextColor={`${theme.text}44`}
        onChangeText={(v) => { setDraft(v); setDirty(true); }}
        onBlur={commit}
        multiline
        style={{ color: theme.text, fontSize: 14, minHeight: 44, textAlignVertical: "top" }}
      />
    </View>
  );
}
