"use client";
import { useParams } from "next/navigation";
import { ClanChatScreen } from "../../../../../client/screens/clans.tsx";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <ClanChatScreen key={id} id={Number(id)} />;
}
