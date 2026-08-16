import axios from "axios";
import { supabase } from "./supabase";

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

export const DEMO_MODE = !process.env.EXPO_PUBLIC_API_URL;

export const api = axios.create({ baseURL: BASE_URL });

// Attach Supabase JWT on every request
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) {
    config.headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  return config;
});

/** Temporarily inject a BYO LLM key header for extraction calls */
export function withLLMKey(key: string) {
  return { headers: { "X-LLM-API-Key": key } };
}
