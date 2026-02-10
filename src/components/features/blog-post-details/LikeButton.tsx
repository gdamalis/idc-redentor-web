"use client";

import { HeartIcon as HeartOutline } from "@heroicons/react/24/outline";
import { HeartIcon as HeartSolid } from "@heroicons/react/24/solid";
import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useState, useRef } from "react";
import { trackEvent } from "@src/lib/analytics";

interface LikeButtonProps {
  readonly slug: string;
  readonly initialCount: number;
  readonly initialHasLiked: boolean;
}

interface LikeState {
  count: number;
  hasLiked: boolean;
}

async function toggleLikeApi(slug: string): Promise<LikeState> {
  const response = await fetch("/api/likes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug }),
  });

  if (!response.ok) {
    throw new Error("Failed to toggle like");
  }

  return response.json();
}

export function LikeButton({
  slug,
  initialCount,
  initialHasLiked,
}: LikeButtonProps) {
  const [state, setState] = useState<LikeState>({
    count: initialCount,
    hasLiked: initialHasLiked,
  });
  const [isPending, setIsPending] = useState(false);
  const pendingRef = useRef(false);

  const handleClick = useCallback(() => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setIsPending(true);

    // Optimistic update
    const previousState = { ...state };
    const optimisticState: LikeState = {
      count: state.hasLiked ? state.count - 1 : state.count + 1,
      hasLiked: !state.hasLiked,
    };
    setState(optimisticState);

    toggleLikeApi(slug)
      .then((result) => {
        setState(result);
        trackEvent("blog_post_like", {
          slug,
          action: result.hasLiked ? "liked" : "unliked",
          total_likes: result.count,
        });
      })
      .catch((error) => {
        console.error("Failed to toggle like:", error);
        setState(previousState);
      })
      .finally(() => {
        pendingRef.current = false;
        setIsPending(false);
      });
  }, [slug, state]);

  const { count, hasLiked } = state;

  return (
    <div className="flex items-center gap-3 py-6 border-t border-border">
      <motion.button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="group flex items-center gap-2 rounded-full border border-border px-4 py-2 cursor-pointer transition-colors hover:border-red-300 hover:bg-red-50 dark:hover:border-red-800 dark:hover:bg-red-950/30 disabled:opacity-70 disabled:cursor-not-allowed"
        whileTap={{ scale: 0.95 }}
        aria-label={hasLiked ? "Unlike this post" : "Like this post"}
      >
        <AnimatePresence mode="wait" initial={false}>
          {hasLiked ? (
            <motion.span
              key="filled"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{
                type: "spring",
                stiffness: 700,
                damping: 20,
                duration: 0.15,
              }}
              className="inline-flex"
            >
              <HeartSolid className="h-5 w-5 text-red-500" />
            </motion.span>
          ) : (
            <motion.span
              key="outline"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{
                type: "spring",
                stiffness: 700,
                damping: 20,
                duration: 0.15,
              }}
              className="inline-flex"
            >
              <HeartOutline className="h-5 w-5 text-muted-foreground group-hover:text-red-400 transition-colors" />
            </motion.span>
          )}
        </AnimatePresence>

        <span className="text-sm font-medium text-muted-foreground tabular-nums">
          {count}
        </span>
      </motion.button>
    </div>
  );
}
