/**
 * Input — matches design-system .field + .input classes exactly.
 *
 * Design spec (.field label):
 *   font-size:12px; margin-bottom:5px; color:text@70%
 *
 * Design spec (.input):
 *   width:100%; min-height:36px; padding:6px 10px; font-size:14px
 *   background:surface; border:1px solid divider; border-radius:8px
 *   focus → border-color:accent
 *
 * textarea.input: min-height:90px; resize:vertical
 */
import React, { useState } from "react";
import { Platform, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { useTheme } from "../../hooks/useTheme";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, style, multiline, ...rest }: InputProps) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);

  // ── Web ────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    const Tag = multiline ? "textarea" : "input";
    return (
      <div className="field" style={style as React.CSSProperties}>
        {label && <label>{label}</label>}
        <Tag
          className={`input${error ? " input-error" : ""}`}
          rows={multiline ? 4 : undefined}
          style={
            error
              ? ({ borderColor: "#EF4444" } as React.CSSProperties)
              : {}
          }
          {...(rest as any)}
        />
        {error && (
          <span style={{ fontSize: 12, color: "#EF4444", marginTop: 4, display: "block" } as React.CSSProperties}>
            {error}
          </span>
        )}
      </div>
    );
  }

  // ── Native ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text style={[styles.label, { color: `${theme.text}b3` }]}>{label}</Text>
      ) : null}
      <TextInput
        multiline={multiline}
        placeholderTextColor={`${theme.text}61`}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          styles.input,
          multiline && styles.multiline,
          {
            color:           theme.text,
            backgroundColor: theme.surface,
            borderColor:     error ? theme.error
                           : focused ? theme.accent
                           : theme.divider,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper:   { gap: 0 },
  label:     { fontSize: 12, marginBottom: 5 },
  input: {
    minHeight: 36,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 14,
    lineHeight: 19.6,
    borderWidth: 1,
    borderRadius: 8,
    width: "100%",
  },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  error:     { fontSize: 12, color: "#EF4444", marginTop: 4 },
});
