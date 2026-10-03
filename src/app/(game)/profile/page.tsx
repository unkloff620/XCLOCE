"use client";
import { Suspense } from "react";
import { ProfileScreen } from "../../../client/screens/profile.tsx";

export default function Page() {
  return (
    <Suspense>
      <ProfileScreen />
    </Suspense>
  );
}
