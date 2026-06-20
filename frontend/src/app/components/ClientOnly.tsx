"use client";

import { useEffect, useState } from "react";

/**
 * ClientOnly — renders children only after the component mounts on the client.
 * This prevents React hydration mismatch errors (#418) caused by content that
 * differs between server-rendered HTML and the initial client render
 * (e.g. browser extension injections, localStorage-dependent state, Date output).
 */
export default function ClientOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <>{fallback}</>;
  return <>{children}</>;
}
