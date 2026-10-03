"use client";
import { useParams } from "next/navigation";
import { ClanScreen } from "../../../../client/screens/clans.tsx";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <ClanScreen key={id} id={Number(id)} />;
}
