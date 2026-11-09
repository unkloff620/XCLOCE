"use client";
import { useParams } from "next/navigation";
import { RaidAttackScreen } from "../../../../../../client/screens/raids.tsx";

export default function Page() {
  const { yard, building } = useParams<{ yard: string; building: string }>();
  return <RaidAttackScreen key={building} yard={yard} building={building} />;
}
