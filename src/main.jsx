import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import RoastMasterAssistant from "./RoastMasterAssistant.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <RoastMasterAssistant />
  </StrictMode>
);
