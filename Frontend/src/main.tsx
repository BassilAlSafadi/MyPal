import { createRoot } from "react-dom/client";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { ThemeProvider } from "./components/ThemeProvider";
import { validateEnv } from "./config/env";
import App from "./App.tsx";
import "./index.css";

validateEnv();

createRoot(document.getElementById("root")!).render(
  <AppErrorBoundary>
    <ThemeProvider defaultTheme="dark">
      <App />
    </ThemeProvider>
  </AppErrorBoundary>
);
