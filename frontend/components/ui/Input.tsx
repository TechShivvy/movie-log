import React from "react";
import { Text, TextInput, TextInputProps, View } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { styles } from "./Input.styles";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
}

export function Input({ label, error, style, multiline, ...rest }: InputProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.wrapper}>
      {label && <Text style={[styles.label, { color: `${theme.text}99` }]}>{label}</Text>}
      <TextInput
        multiline={multiline}
        placeholderTextColor={`${theme.text}55`}
        style={[
          styles.input,
          multiline && styles.multiline,
          {
            color: theme.text,
            backgroundColor: theme.surfaceHigh,
            borderColor: error ? "#e53935" : theme.divider,
          },
          style,
        ]}
        {...rest}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}
