import { PropsWithChildren, useEffect } from "react";
import { useDispatch } from "react-redux";
import { supabase } from "../lib/supabase";
import { setLoading, setSession } from "../store/authSlice";

/** Syncs Supabase auth state into the Redux store. Must be rendered inside <Provider>. */
export function SessionProvider({ children }: PropsWithChildren) {
  const dispatch = useDispatch();

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      dispatch(setSession(data.session ?? null));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      dispatch(setSession(session));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [dispatch]);

  return <>{children}</>;
}
