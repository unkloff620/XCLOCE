"use client";
import { useParams } from "next/navigation";
import { MasterScreen } from "../../../../client/screens/masters.tsx";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <MasterScreen key={id} id={id} />;
}
