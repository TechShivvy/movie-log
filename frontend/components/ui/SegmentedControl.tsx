/**
 * SegmentedControl — matches design-system .seg + .seg-opt classes exactly.
 *
 * Design spec (.seg):
 *   display:inline-flex; overflow:hidden; border:1px solid divider; border-radius:8px
 *
 * Design spec (.seg-opt):
 *   padding:7px 12px; font-size:13px; cursor:pointer; color:text@70%
 *   + .seg-opt { border-left:1px solid divider }
 *
 * .seg-opt.active:
 *   color:accent; box-shadow:inset 0 0 0 1px accent
 */
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { useTheme } from "../../hooks/useTheme";

interface Option { label: string; value: string }

interface SegmentedControlProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  style?: ViewStyle | any;
}

export function SegmentedControl({ options, value, onChange, style }: SegmentedControlProps) {
  const { theme } = useTheme();

  // ── Web ────────────────────────────────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <div className="seg" style={style as React.CSSProperties}>
        {options.map((opt) => (
          <button
            key={opt.value}
            className={opt.value === value ? "seg-opt active" : "seg-opt"}
            onClick={() => onChange(opt.value)}
            style={{ background: "none", border: "none" } as React.CSSProperties}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  // ── Native ─────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { borderColor: theme.divider }, style]}>
      {options.map((opt, idx) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.option,
              idx > 0 && { borderLeftWidth: 1, borderLeftColor: theme.divider },
              active && {
                // Inset border approximation via backgroundColor tint
                backgroundColor: `${theme.accent}15`,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: active ? theme.accent : `${theme.text}b3` },
                active && styles.labelActive,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  label: {
    fontSize: 13,
  },
  labelActive: {
    fontWeight: "500",
  },
});
