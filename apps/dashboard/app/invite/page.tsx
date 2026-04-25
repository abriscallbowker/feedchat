"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import DashboardHomePage from "../page";
import { getFirebaseAuth } from "../../lib/firebase";

export default function InvitePage() {
  const router = useRouter();
  const [canRenderInviteFlow, setCanRenderInviteFlow] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      // If Firebase isn't configured/available, fall back to previous behavior.
      setCanRenderInviteFlow(true);
      return;
    }

    if (auth.currentUser) {
      router.replace("/");
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/");
        return;
      }
      setCanRenderInviteFlow(true);
    });
    return unsubscribe;
  }, [router]);

  if (!canRenderInviteFlow) return null;
  return <DashboardHomePage />;
}
