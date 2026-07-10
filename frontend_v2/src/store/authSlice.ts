import type { Session } from "@supabase/supabase-js";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

interface AuthState {
  session: Session | null;
  isLoading: boolean;
}

const initialState: AuthState = { session: null, isLoading: true };

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setSession(state, action: PayloadAction<Session | null>) {
      state.session = action.payload;
      state.isLoading = false;
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
  },
});

export const { setSession, setLoading } = authSlice.actions;
export default authSlice.reducer;
