import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Terminal, X, Filter } from "lucide-react";

interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  session: string;
  message: string;
}

export default function TerminalLogs() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>("all");
  const [filterText, setFilterText] = useState("");
  const terminalRef = useRef<HTMLDivElement>(null);

  // Mock logs - in real implementation, fetch from API
  useEffect(() => {
    const mockLogs: LogEntry[] = [
      {
        timestamp: new Date().toISOString(),
        level: "info",
        session: "session-123",
        message: "[RouteManager] Matched route 'long-context' with priority 800",
      },
      {
        timestamp: new Date().toISOString(),
        level: "info",
        session: "session-123",
        message: "[PreProcessor] CommandDetector: Detected /compact command",
      },
      {
        timestamp: new Date().toISOString(),
        level: "debug",
        session: "session-456",
        message: "[ContextEnricher] Token count: 45678, threshold: 60000",
      },
      {
        timestamp: new Date().toISOString(),
        level: "info",
        session: "session-456",
        message: "[ThinkCommand] Routed to ultrathink model",
      },
    ];
    setLogs(mockLogs);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const sessions = ["all", ...Array.from(new Set(logs.map((l) => l.session)))];

  const filteredLogs = logs.filter((log) => {
    const sessionMatch = selectedSession === "all" || log.session === selectedSession;
    const textMatch = log.message.toLowerCase().includes(filterText.toLowerCase());
    return sessionMatch && textMatch;
  });

  const getLevelColor = (level: string) => {
    switch (level) {
      case "error":
        return "text-red-500";
      case "warn":
        return "text-yellow-500";
      case "debug":
        return "text-blue-500";
      default:
        return "text-green-500";
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            <CardTitle className="text-lg">{t("router.terminal.title")}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedSession} onValueChange={setSelectedSession}>
              <SelectTrigger className="w-[180px] h-8">
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
              <Filter className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("router.terminal.filter")}
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="pl-8 h-8 w-[200px]"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLogs([])}
            >
              {t("router.terminal.clear")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <div
          ref={terminalRef}
          className="h-full overflow-y-auto bg-black text-white font-mono text-xs p-4 space-y-1"
        >
          {filteredLogs.length === 0 ? (
            <div className="text-gray-500">{t("router.terminal.no_logs")}</div>
          ) : (
            filteredLogs.map((log, index) => (
              <div key={index} className="flex gap-2">
                <span className="text-gray-500">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className={getLevelColor(log.level)}>[{log.level.toUpperCase()}]</span>
                <span className="text-cyan-400">[{log.session}]</span>
                <span>{log.message}</span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
