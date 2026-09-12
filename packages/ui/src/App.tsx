import { useEffect, useState } from "react";
import { Button } from "./components/ui/button.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs.tsx";
import { ConfigEditor } from "./views/ConfigEditor.tsx";
import { Dashboard } from "./views/Dashboard.tsx";
import { History } from "./views/History.tsx";

type Theme = "light" | "dark";

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("mcst-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // storage blocked; fall through to the media query
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("mcst-theme", theme);
    } catch {
      // ignore storage failures
    }
  }, [theme]);

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Minecraft Stress Tester</h1>
          <p className="text-sm text-muted-foreground">Authorized testing only.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? "Light" : "Dark"} mode
        </Button>
      </header>

      <Tabs defaultValue="dashboard" className="flex flex-col">
        <TabsList className="self-start">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard">
          <Dashboard />
        </TabsContent>
        <TabsContent value="config">
          <ConfigEditor />
        </TabsContent>
        <TabsContent value="history">
          <History />
        </TabsContent>
      </Tabs>
    </div>
  );
}
