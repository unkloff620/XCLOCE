"use client";
import { useParams } from "next/navigation";
import { LocationScreen } from "../../../../client/screens/locations.tsx";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <LocationScreen key={id} id={id} />;
}
