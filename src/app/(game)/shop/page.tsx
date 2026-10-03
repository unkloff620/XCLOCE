"use client";
import { Suspense } from "react";
import { ShopScreen } from "../../../client/screens/shop.tsx";

export default function Page() {
  return (
    <Suspense>
      <ShopScreen />
    </Suspense>
  );
}
