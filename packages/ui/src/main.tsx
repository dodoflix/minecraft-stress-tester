import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./index.css";

const el = document.getElementById("root");
if (el)
  createRoot(el).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
