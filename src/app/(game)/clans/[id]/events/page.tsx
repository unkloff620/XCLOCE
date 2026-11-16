"use client";
import { useParams } from "next/navigation";
import { ClanEventsScreen } from "../../../../../client/screens/clans.tsx";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <ClanEventsScreen key={id} id={Number(id)} />;
}
