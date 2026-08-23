import { createRoot } from "react-dom/client";
import { PeekApp } from "@/components/peek/app";
import "@/styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element.");
}

createRoot(root).render(<PeekApp />);
