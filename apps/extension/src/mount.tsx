import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { CapturePanel } from "./CapturePanel";
import "./panel.css";

export function mountCapturePanel(): void {
  const root = document.querySelector<HTMLElement>("#root");
  if (root === null) throw new Error("Coredrill extension root is missing.");
  createRoot(root).render(
    <StrictMode>
      <CapturePanel />
    </StrictMode>,
  );
}
