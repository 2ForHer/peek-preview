import { createFileRoute } from "@tanstack/react-router";
import { PeekApp } from "@/components/peek/app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <PeekApp />;
}
