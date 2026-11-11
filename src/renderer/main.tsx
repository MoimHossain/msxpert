import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("CSU Console could not find the #root element to mount into.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
