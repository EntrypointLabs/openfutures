import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "../../website/src/styles/fonts.css";
import "../../website/src/styles/framer.css";
import "../../website/src/styles/theme.css";
import "../../website/src/styles/behaviors.css";
import "./styles.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
