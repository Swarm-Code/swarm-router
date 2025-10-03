import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Terminal, X, Filter, Maximize2, Minimize2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  session: string;
  message: string;
  raw: string;
}

export default function ResizableTerminal() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>("all");
  const [filterText, setFilterText] = useState("");
  const [height, setHeight] = useState(200);
  const [isResizing, setIsResizing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const terminalRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number>(0);
  const startHeightRef = useRef<number>(0);
  const lastLogCountRef = useRef<number>(0);

  // Fetch logs from API - now returns pre-parsed structured data
  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      const files = await api.getLogFiles();

      if (files.length === 0) {
        setLogs([]);
        return;
      }

      // Get the most recent log file
      const sortedFiles = files.sort((a, b) =>
        new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
      );

      const latestFile = sortedFiles[0];
      // API now returns pre-parsed log entries with limit=500
      const parsedLogs = await api.getLogs(latestFile.path);

      // Only update if logs have changed
      if (parsedLogs.length !== lastLogCountRef.current) {
        setLogs(parsedLogs as LogEntry[]);
        lastLogCountRef.current = parsedLogs.length;
      }
    } catch (error) {
      console.error("Failed to fetch logs:", error);
      // Keep existing logs on error
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchLogs();

    if (autoRefresh) {
      const interval = setInterval(fetchLogs, 2000); // Poll every 2 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (terminalRef.current && !isCollapsed) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, isCollapsed]);

  // Handle mouse resize
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    startYRef.current = e.clientY;
    startHeightRef.current = height;
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const delta = startYRef.current - e.clientY;
      const newHeight = Math.max(100, Math.min(600, startHeightRef.current + delta));
      setHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, height]);

  const sessions = ["all", ...Array.from(new Set(logs.map((l) => l.session)))];

  const filteredLogs = logs.filter((log) => {
    const sessionMatch = selectedSession === "all" || log.session === selectedSession;
    const textMatch = log.message.toLowerCase().includes(filterText.toLowerCase());
    return sessionMatch && textMatch;
  });

  const getLevelColor = (level: string) => {
    switch (level) {
      case "error":
        return "text-red-400";
      case "warn":
        return "text-yellow-400";
      case "debug":
        return "text-blue-400";
      default:
        return "text-green-400";
    }
  };

  const handleClearLogs = async () => {
    try {
      const files = await api.getLogFiles();
      if (files.length > 0) {
        await api.clearLogs(files[0].path);
      }
      setLogs([]);
      lastLogCountRef.current = 0;
    } catch (error) {
      console.error("Failed to clear logs:", error);
    }
  };

  return (
    <Card className="relative flex flex-col" style={{ height: isCollapsed ? '48px' : `${height}px` }}>
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize bg-transparent hover:bg-primary/20 transition-colors z-10"
      />

      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            <span className="text-sm font-semibold">{t("router.terminal.title")}</span>
            <span className="text-xs text-muted-foreground">
              ({filteredLogs.length} logs)
              {isLoading && <span className="ml-1 animate-pulse">⟳</span>}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!isCollapsed && (
              <>
                <Select value={selectedSession} onValueChange={setSelectedSession}>
                  <SelectTrigger className="w-[140px] h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((session) => (
                      <SelectItem key={session} value={session}>
                        {session === "all" ? t("router.terminal.all_sessions") : session}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Filter className="absolute left-2 top-1.5 h-3 w-3 text-muted-foreground" />
                  <Input
                    placeholder={t("router.terminal.filter")}
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    className="pl-7 h-7 w-[160px] text-xs"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`h-7 px-2 ${autoRefresh ? "text-green-500" : ""}`}
                  title={autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
                >
                  <RefreshCw className={`h-3 w-3 ${autoRefresh ? "animate-spin" : ""}`} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearLogs}
                  className="h-7 px-2"
                >
                  <X className="h-3 w-3" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="h-7 px-2"
            >
              {isCollapsed ? <Maximize2 className="h-3 w-3" /> : <Minimize2 className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {!isCollapsed && (
        <CardContent className="flex-1 p-0 overflow-hidden">
          <div
            ref={terminalRef}
            className="h-full overflow-y-auto bg-black text-white font-mono text-[11px] p-3 space-y-0.5 leading-tight"
          >
            {filteredLogs.length === 0 ? (
              <div className="text-gray-500">{t("router.terminal.no_logs")}</div>
            ) : (
              filteredLogs.map((log, index) => (
                <div key={index} className="flex gap-2 hover:bg-gray-900/50">
                  <span className="text-gray-500 flex-shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`${getLevelColor(log.level)} flex-shrink-0 font-bold`}>
                    [{log.level.toUpperCase()}]
                  </span>
                  <span className="text-cyan-400 flex-shrink-0">[{log.session}]</span>
                  <span className="break-all">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
