"use client";
import { useParams } from "next/navigation";
import { BossScreen } from "../../../../client/screens/boss.tsx";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <BossScreen key={id} id={id} />;
}
