import React from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { useTheme } from "../../hooks/useTheme";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, style, ...rest }: InputProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.wrapper}>
      {label && <Text style={[styles.label, { color: `${theme.text}99` }]}>{label}</Text>}
      <TextInput
        placeholderTextColor={`${theme.text}55`}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.surfaceHigh, borderColor: error ? "#e53935" : theme.divider },
          style,
        ]}
        {...rest}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 4 },
  label: { fontSize: 12, fontWeight: "500", marginBottom: 2 },
  input: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  error: { color: "#e53935", fontSize: 11 },
});
