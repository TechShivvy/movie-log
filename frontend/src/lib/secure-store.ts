import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const USER_OPENROUTER_KEY = "user_openrouter_api_key";

// On web, localStorage is XSS-accessible so we must NOT persist API keys there.
// Instead we keep the key in module-level memory for the session only.
// On native, expo-secure-store encrypts the value in the device keychain.
let _webRuntimeKey: string | null = null;

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return key === USER_OPENROUTER_KEY ? _webRuntimeKey : null;
  }
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    if (key === USER_OPENROUTER_KEY) _webRuntimeKey = value;
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function removeItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    if (key === USER_OPENROUTER_KEY) _webRuntimeKey = null;
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function getUserOpenRouterKey(): Promise<string | null> {
  return getItem(USER_OPENROUTER_KEY);
}

export async function setUserOpenRouterKey(value: string): Promise<void> {
  await setItem(USER_OPENROUTER_KEY, value);
}

export async function clearUserOpenRouterKey(): Promise<void> {
  await removeItem(USER_OPENROUTER_KEY);
}
