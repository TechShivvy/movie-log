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

// forwardRef so a caller can chain focus (email field's onSubmitEditing →
// password field) the way a plain TextInput ref normally would — a bare
// function component silently drops any `ref` passed to it and logs a
// dev warning, which would make that chaining a no-op.
export const Input = React.forwardRef<TextInput, InputProps>(function Input(
  { label, error, style, multiline, ...rest },
  ref,
) {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);

  // ── Web ────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    // This component's own prop contract is TextInputProps — every real
    // caller passes onChangeText/keyboardType/secureTextEntry/returnKeyType,
    // the RN idiom, never onChange/type. This branch used to spread `rest`
    // straight onto a plain DOM <input>/<textarea>, which doesn't
    // understand any of those: no onChange handler ever reached the DOM at
    // all (onChangeText isn't a real event), so a controlled `value` with
    // no working way to change it made every field genuinely read-only —
    // invisible as long as nothing ever rendered this branch, which
    // changed once screens started reusing their native branch (built
    // against this exact prop contract) on web too. Bridges the actual
    // subset every caller in this codebase uses, rather than spreading
    // blind and hoping DOM attributes happen to line up.
    const {
      value, onChangeText, placeholder, secureTextEntry, keyboardType,
      autoCapitalize, autoComplete, returnKeyType, onSubmitEditing,
      onFocus, onBlur, maxLength, numberOfLines, editable, autoFocus,
    } = rest as any;

    const type = secureTextEntry ? "password"
      : keyboardType === "email-address" ? "email"
      : "text";
    // inputMode is the correct way to hint a numeric keyboard on web —
    // type="number" brings its own spinner arrows and blocks non-digit
    // characters HTML5-validation-style, neither of which this design
    // wants (e.g. a free-typed "±10" delta field).
    const inputMode =
      keyboardType === "numeric" || keyboardType === "number-pad" ? "numeric"
      : keyboardType === "decimal-pad" ? "decimal"
      : keyboardType === "email-address" ? "email"
      : undefined;

    const Tag = multiline ? "textarea" : "input";
    return (
      <div className="field" style={style as React.CSSProperties}>
        {label && <label>{label}</label>}
        <Tag
          ref={ref as any}
          className={`input${error ? " input-error" : ""}`}
          rows={multiline ? (numberOfLines ?? 4) : undefined}
          type={multiline ? undefined : type}
          inputMode={inputMode}
          value={value ?? ""}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={editable === false}
          autoFocus={autoFocus}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          // returnKeyType's closest real web equivalent — hints the
          // on-screen keyboard's enter key label/icon (mobile Safari and
          // Chrome both honor it) — plus onKeyDown below actually wires
          // Enter to onSubmitEditing, which enterKeyHint alone doesn't do.
          enterKeyHint={returnKeyType}
          onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChangeText?.(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === "Enter" && !multiline) onSubmitEditing?.();
          }}
          style={
            error
              ? ({ borderColor: theme.error } as React.CSSProperties)
              : {}
          }
        />
        {error && (
          <span style={{ fontSize: 12, color: theme.error, marginTop: 4, display: "block" } as React.CSSProperties}>
            {error}
          </span>
        )}
      </div>
    );
  }

  // ── Native ─────────────────────────────────────────────────────────────────
  // onFocus/onBlur pulled out of `rest` (rather than left in the {...rest}
  // spread below) so a caller's own handler — e.g. a suggestions dropdown
  // closing itself on blur — actually fires. {...rest} spreads AFTER these,
  // so leaving them in rest would silently let a caller's onBlur override
  // (not merge with) the focused-state tracking below, breaking the
  // focus-ring border color the moment any caller passed its own onBlur.
  const { onFocus: callerOnFocus, onBlur: callerOnBlur, ...restNoFocus } = rest as any;
  return (
    <View style={styles.wrapper}>
      {label ? (
        <Text style={[styles.label, { color: `${theme.text}b3` }]}>{label}</Text>
      ) : null}
      <TextInput
        ref={ref}
        multiline={multiline}
        placeholderTextColor={`${theme.text}61`}
        onFocus={(e) => { setFocused(true); callerOnFocus?.(e); }}
        onBlur={(e) => { setFocused(false); callerOnBlur?.(e); }}
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
        {...restNoFocus}
      />
      {error ? (
        <Text style={[styles.error, { color: theme.error }]}>{error}</Text>
      ) : null}
    </View>
  );
});

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
  error:     { fontSize: 12, marginTop: 4 },
});
