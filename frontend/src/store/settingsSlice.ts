import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ThemeName } from "../theme/ThemeContext";

interface SettingsState {
  themeName: ThemeName;
  autoFill: boolean;
  preferredModel: string;
}

const initialState: SettingsState = {
  themeName: "cinema",
  autoFill: false,
  preferredModel: "qwen/qwen2.5-vl-72b-instruct:free",
};

export const settingsSlice = createSlice({
  name: "settings",
  initialState,
  reducers: {
    setTheme(state, action: PayloadAction<ThemeName>) {
      state.themeName = action.payload;
    },
    setAutoFill(state, action: PayloadAction<boolean>) {
      state.autoFill = action.payload;
    },
    setPreferredModel(state, action: PayloadAction<string>) {
      state.preferredModel = action.payload;
    },
  },
});

export const { setTheme, setAutoFill, setPreferredModel } =
  settingsSlice.actions;
export default settingsSlice.reducer;
