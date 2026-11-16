"use client";
import { useParams } from "next/navigation";
import { ClanShodScreen } from "../../../../../client/screens/shodnyak.tsx";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <ClanShodScreen key={id} id={Number(id)} />;
}
