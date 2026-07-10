import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  /** ms — defaults to 4000 */
  duration?: number;
}

interface UIState {
  toasts: Toast[];
  /** null = idle, 'loading' = in progress */
  autofillStatus: null | "loading";
}

const initialState: UIState = { toasts: [], autofillStatus: null };

export const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    pushToast(state, action: PayloadAction<Omit<Toast, "id">>) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      state.toasts.push({ ...action.payload, id });
    },
    dismissToast(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    setAutofillStatus(state, action: PayloadAction<UIState["autofillStatus"]>) {
      state.autofillStatus = action.payload;
    },
  },
});

export const { pushToast, dismissToast, setAutofillStatus } = uiSlice.actions;
export default uiSlice.reducer;
