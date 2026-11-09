"use client";
import { useParams } from "next/navigation";
import { RaidYardScreen } from "../../../../../client/screens/raids.tsx";

export default function Page() {
  const { yard } = useParams<{ yard: string }>();
  return <RaidYardScreen key={yard} id={yard} />;
}
