"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type UseRealtimeChannelOptions = {
  channelName: string;
  enabled?: boolean;
  onPayload?: (payload: unknown) => void;
};

export function useRealtimeChannel({ channelName, enabled = true, onPayload }: UseRealtimeChannelOptions) {
  useEffect(() => {
    if (!enabled) return;

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public" }, (payload) => {
        onPayload?.(payload);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, enabled, onPayload]);
}
