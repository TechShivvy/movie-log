import { useAppDispatch } from "../store";
import { pushToast, type ToastVariant } from "../store/uiSlice";

// Error code → user-friendly message map (from backend uniform error taxonomy).
const CODE_MESSAGES: Record<
  string,
  { message: string; variant: ToastVariant }
> = {
  RATE_LIMIT_MINUTE: {
    message: "Too many requests — please wait a moment and try again.",
    variant: "warning",
  },
  QUOTA_DAILY_EXCEEDED: {
    message:
      "Daily free limit reached. Add your own OpenRouter key in Settings or come back tomorrow.",
    variant: "warning",
  },
  UNAUTHORIZED: {
    message: "Your session has expired. Please sign in again.",
    variant: "error",
  },
  PAYLOAD_TOO_LARGE: {
    message: "The image is too large. Please use an image smaller than 25 MB.",
    variant: "error",
  },
  UNSUPPORTED_MEDIA_TYPE: {
    message: "Unsupported image type. Please upload a JPEG, PNG or WebP file.",
    variant: "error",
  },
  UPSTREAM_ERROR: {
    message:
      "The AI model returned an unexpected response. Try again or switch model in Settings.",
    variant: "error",
  },
  VALIDATION_ERROR: {
    message: "Some fields are invalid. Check your input and try again.",
    variant: "warning",
  },
  NOT_FOUND: {
    message: "That item no longer exists.",
    variant: "info",
  },
  FORBIDDEN: {
    message: "You do not have permission to perform that action.",
    variant: "error",
  },
  NETWORK_ERROR: {
    message: "No connection. Check your internet and try again.",
    variant: "error",
  },
};

/** Parse an RTK Query / fetch error into a {code, message} pair. */
function parseApiError(error: unknown): { code: string; message: string } {
  if (!error || typeof error !== "object") {
    return { code: "INTERNAL_ERROR", message: "Something went wrong." };
  }

  const e = error as Record<string, unknown>;

  // RTK fetchBaseQuery error
  if ("status" in e) {
    if (e.status === "FETCH_ERROR" || e.status === "TIMEOUT_ERROR") {
      return { code: "NETWORK_ERROR", message: "" };
    }
    const data = e.data as Record<string, unknown> | undefined;
    const code = (data?.code ?? "INTERNAL_ERROR") as string;
    const message = (data?.message ?? "Something went wrong.") as string;
    return { code, message };
  }

  return {
    code: "INTERNAL_ERROR",
    message: String(e.message ?? "Something went wrong."),
  };
}

export function useToast() {
  const dispatch = useAppDispatch();

  function toast(
    message: string,
    variant: ToastVariant = "info",
    duration?: number,
  ) {
    dispatch(pushToast({ message, variant, duration }));
  }

  function toastError(error: unknown) {
    const { code, message } = parseApiError(error);
    const mapped = CODE_MESSAGES[code];
    dispatch(
      pushToast({
        variant: mapped?.variant ?? "error",
        message: mapped?.message ?? message,
      }),
    );
  }

  function toastSuccess(message: string) {
    dispatch(pushToast({ message, variant: "success" }));
  }

  return { toast, toastError, toastSuccess };
}
