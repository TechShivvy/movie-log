import React from "react";
import { Pressable, Text, View, ViewStyle } from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { styles } from "./SegmentedControl.styles";

interface Option { label: string; value: string }

interface SegmentedControlProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  style?: ViewStyle;
}

export function SegmentedControl({ options, value, onChange, style }: SegmentedControlProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.surfaceHigh, borderColor: theme.divider }, style]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.option,
              active && { backgroundColor: theme.surface, borderColor: theme.divider },
            ]}
          >
            <Text style={[styles.label, { color: active ? theme.accent : `${theme.text}88` }]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

