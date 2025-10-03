import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useTranslation } from 'react-i18next';
import { X, RefreshCw, Download, Trash2, ArrowLeft, File, Layers } from 'lucide-react';

interface LogViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showToast?: (message: string, type: 'success' | 'error' | 'warning') => void;
}

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string; // 现在这个字段直接包含原始JSON字符串
  source?: string;
  reqId?: string;
}

interface LogFile {
  name: string;
  path: string;
  size: number;
  lastModified: string;
}

interface GroupedLogs {
  [reqId: string]: LogEntry[];
}

interface LogGroupSummary {
  reqId: string;
  logCount: number;
  firstLog: string;
  lastLog: string;
  model?: string;
}

interface GroupedLogsResponse {
  grouped: boolean;
  groups: { [reqId: string]: LogEntry[] };
  summary: {
    totalRequests: number;
    totalLogs: number;
    requests: LogGroupSummary[];
  };
}

export function LogViewer({ open, onOpenChange, showToast }: LogViewerProps) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<Array<{ timestamp: string; level: string; session: string; message: string; raw: string }>>([]);
  const [logFiles, setLogFiles] = useState<LogFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<LogFile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [groupByReqId, setGroupByReqId] = useState(false);
  const [groupedLogs, setGroupedLogs] = useState<GroupedLogsResponse | null>(null);
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const refreshInterval = useRef<NodeJS.Timeout | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    if (open) {
      loadLogFiles();
    }
  }, [open]);

  // 创建内联 Web Worker
  const createInlineWorker = (): Worker => {
    const workerCode = `
      // 日志聚合Web Worker
      self.onmessage = function(event) {
        const { type, data } = event.data;
        
        if (type === 'groupLogsByReqId') {
          try {
            const { logs } = data;
            
            // 按reqId聚合日志
            const groupedLogs = {};
            
            logs.forEach((log, index) => {
              log = JSON.parse(log);
              let reqId = log.reqId || 'no-req-id';
              
              if (!groupedLogs[reqId]) {
                groupedLogs[reqId] = [];
              }
              groupedLogs[reqId].push(log);
            });

            // 按时间戳排序每个组的日志
            Object.keys(groupedLogs).forEach(reqId => {
              groupedLogs[reqId].sort((a, b) => a.time - b.time);
            });

            // 提取model信息
            const extractModelInfo = (reqId) => {
              const logGroup = groupedLogs[reqId];
              for (const log of logGroup) {
                try {
                  // 尝试从message字段解析JSON
                  if (log.type === 'request body' && log.data && log.data.model) {
                    return log.data.model;
                  }
                } catch (e) {
                  // 解析失败，继续尝试下一条日志
                }
              }
              return undefined;
            };

            // 生成摘要信息
            const summary = {
              totalRequests: Object.keys(groupedLogs).length,
              totalLogs: logs.length,
              requests: Object.keys(groupedLogs).map(reqId => ({
                reqId,
                logCount: groupedLogs[reqId].length,
                firstLog: groupedLogs[reqId][0]?.time,
                lastLog: groupedLogs[reqId][groupedLogs[reqId].length - 1]?.time,
                model: extractModelInfo(reqId)
              }))
            };

            const response = {
              grouped: true,
              groups: groupedLogs,
              summary
            };

            // 发送结果回主线程
            self.postMessage({
              type: 'groupLogsResult',
              data: response
            });
          } catch (error) {
            // 发送错误回主线程
            self.postMessage({
              type: 'error',
              error: error instanceof Error ? error.message : 'Unknown error occurred'
            });
          }
        }
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    return new Worker(workerUrl);
  };

  // 初始化Web Worker
  useEffect(() => {
    if (typeof Worker !== 'undefined') {
      try {
        // 创建内联Web Worker
        workerRef.current = createInlineWorker();

        // 监听Worker消息
        workerRef.current.onmessage = (event) => {
          const { type, data, error } = event.data;

          if (type === 'groupLogsResult') {
            setGroupedLogs(data);
          } else if (type === 'error') {
            console.error('Worker error:', error);
            if (showToast) {
              showToast(t('log_viewer.worker_error') + ': ' + error, 'error');
            }
          }
        };

        // 监听Worker错误
        workerRef.current.onerror = (error) => {
          console.error('Worker error:', error);
          if (showToast) {
            showToast(t('log_viewer.worker_init_failed'), 'error');
          }
        };
      } catch (error) {
        console.error('Failed to create worker:', error);
        if (showToast) {
          showToast(t('log_viewer.worker_init_failed'), 'error');
        }
      }
    }

    // 清理Worker
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [showToast, t]);

  useEffect(() => {
    if (autoRefresh && open && selectedFile) {
      refreshInterval.current = setInterval(() => {
        loadLogs();
      }, 5000); // Refresh every 5 seconds
    } else if (refreshInterval.current) {
      clearInterval(refreshInterval.current);
    }

    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    };
  }, [autoRefresh, open, selectedFile]);

  // Load logs when selected file changes
  useEffect(() => {
    if (selectedFile && open) {
      setLogs([]); // Clear existing logs
      loadLogs();
    }
  }, [selectedFile, open]);

  // Handle open/close animations
  useEffect(() => {
    if (open) {
      setIsVisible(true);
      // Trigger the animation after a small delay to ensure the element is rendered
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else {
      setIsAnimating(false);
      // Wait for the animation to complete before hiding
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const loadLogFiles = async () => {
    try {
      setIsLoading(true);
      const response = await api.getLogFiles();

      if (response && Array.isArray(response)) {
        setLogFiles(response);
        setSelectedFile(null);
        setLogs([]);
      } else {
        setLogFiles([]);
        if (showToast) {
          showToast(t('log_viewer.no_log_files_available'), 'warning');
        }
      }
    } catch (error) {
      console.error('Failed to load log files:', error);
      if (showToast) {
        showToast(t('log_viewer.load_files_failed') + ': ' + (error as Error).message, 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loadLogs = async () => {
    if (!selectedFile) return;

    try {
      setIsLoading(true);
      setGroupedLogs(null);
      setSelectedReqId(null);

      // 始终加载原始日志数据
      const response = await api.getLogs(selectedFile.path);

      if (response && Array.isArray(response)) {
        // 现在接口返回的是原始日志字符串数组，直接存储
        setLogs(response);

        // 如果启用了分组，使用Web Worker进行聚合（需要转换为LogEntry格式供Worker使用）
        if (groupByReqId && workerRef.current) {
          // const workerLogs: LogEntry[] = response.map((logLine, index) => ({
          //   timestamp: new Date().toISOString(),
          //   level: 'info',
          //   message: logLine,
          //   source: undefined,
          //   reqId: undefined
          // }));

          workerRef.current.postMessage({
            type: 'groupLogsByReqId',
            data: { logs: response }
          });
        } else {
          setGroupedLogs(null);
        }
      } else {
        setLogs([]);
        setGroupedLogs(null);
        if (showToast) {
          showToast(t('log_viewer.no_logs_available'), 'warning');
        }
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
      if (showToast) {
        showToast(t('log_viewer.load_failed') + ': ' + (error as Error).message, 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const clearLogs = async () => {
    if (!selectedFile) return;

    try {
      await api.clearLogs(selectedFile.path);
      setLogs([]);
      if (showToast) {
        showToast(t('log_viewer.logs_cleared'), 'success');
      }
    } catch (error) {
      console.error('Failed to clear logs:', error);
      if (showToast) {
        showToast(t('log_viewer.clear_failed') + ': ' + (error as Error).message, 'error');
      }
    }
  };

  const selectFile = (file: LogFile) => {
    setSelectedFile(file);
    setAutoRefresh(false); // Reset auto refresh when changing files
  };


  const toggleGroupByReqId = () => {
    const newValue = !groupByReqId;
    setGroupByReqId(newValue);

    if (newValue && selectedFile && logs.length > 0) {
      // 启用聚合时，如果已有日志，则使用Worker进行聚合
      if (workerRef.current) {
        workerRef.current.postMessage({
          type: 'groupLogsByReqId',
          data: { logs }
        });
      }
    } else if (!newValue) {
      // 禁用聚合时，清除聚合结果
      setGroupedLogs(null);
      setSelectedReqId(null);
    }
  };

  const selectReqId = (reqId: string) => {
    setSelectedReqId(reqId);
  };


  const getDisplayLogs = () => {
    if (groupByReqId && groupedLogs) {
      if (selectedReqId && groupedLogs.groups[selectedReqId]) {
        return groupedLogs.groups[selectedReqId];
      }
      // 当在分组模式但没有选中具体请求时，显示原始日志
      return logs.map(logLine => ({
        timestamp: logLine.timestamp,
        level: logLine.level,
        message: logLine.message,
        source: undefined,
        reqId: undefined
      }));
    }
    // 当不在分组模式时，显示原始日志
    return logs.map(logLine => ({
      timestamp: logLine.timestamp,
      level: logLine.level,
      message: logLine.message,
      source: undefined,
      reqId: undefined
    }));
  };

  const downloadLogs = () => {
    if (!selectedFile || logs.length === 0) return;

    // 直接下载原始日志字符串，每行一个日志
    const logText = logs.map(log => log.raw).join('\n');

    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedFile.name}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (showToast) {
      showToast(t('log_viewer.logs_downloaded'), 'success');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // 面包屑导航项类型
  interface BreadcrumbItem {
    id: string;
    label: string;
    onClick: () => void;
  }

  // 获取面包屑导航项
  const getBreadcrumbs = (): BreadcrumbItem[] => {
    const breadcrumbs: BreadcrumbItem[] = [
      {
        id: 'root',
        label: t('log_viewer.title'),
        onClick: () => {
          setSelectedFile(null);
          setAutoRefresh(false);
          setLogs([]);
          setGroupedLogs(null);
          setSelectedReqId(null);
          setGroupByReqId(false);
        }
      }
    ];

    if (selectedFile) {
      breadcrumbs.push({
        id: 'file',
        label: selectedFile.name,
        onClick: () => {
          if (groupByReqId) {
            // 如果在分组模式下，点击文件层级应该返回到分组列表
            setSelectedReqId(null);
          } else {
            // 如果不在分组模式下，点击文件层级关闭分组功能
            setSelectedReqId(null);
            setGroupedLogs(null);
            setGroupByReqId(false);
          }
        }
      });
    }

    if (selectedReqId) {
      breadcrumbs.push({
        id: 'req',
        label: `${t('log_viewer.request')} ${selectedReqId}`,
        onClick: () => {
          // 点击当前层级时不做任何操作
        }
      });
    }

    return breadcrumbs;
  };

  // 获取返回按钮的处理函数
  const getBackAction = (): (() => void) | null => {
    if (selectedReqId) {
      return () => {
        setSelectedReqId(null);
      };
    } else if (selectedFile) {
      return () => {
        setSelectedFile(null);
        setAutoRefresh(false);
        setLogs([]);
        setGroupedLogs(null);
        setSelectedReqId(null);
        setGroupByReqId(false);
      };
    }
    return null;
  };

  const formatLogsForEditor = () => {
    // 如果在分组模式且选中了具体请求，显示该请求的日志
    if (groupByReqId && groupedLogs && selectedReqId && groupedLogs.groups[selectedReqId]) {
      const requestLogs = groupedLogs.groups[selectedReqId];
      console.log(requestLogs)
      // 提取原始JSON字符串并每行一个
      return requestLogs.map(log => JSON.stringify(log)).join('\n');
    }

    // 其他情况，直接显示原始日志字符串数组，每行一个
    return logs.join('\n');
  };

  if (!isVisible && !open) {
    return null;
  }

  return (
    <>
      {(isVisible || open) && (
        <div
          className={`fixed inset-0 z-50 transition-all duration-300 ease-out ${
            isAnimating && open ? 'bg-black/50 opacity-100' : 'bg-black/0 opacity-0 pointer-events-none'
          }`}
          onClick={() => onOpenChange(false)}
        />
      )}

      <div
        ref={containerRef}
        className={`fixed bottom-0 left-0 right-0 z-50 flex flex-col bg-white shadow-2xl transition-all duration-300 ease-out transform ${
          isAnimating && open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{
          height: '100vh',
          maxHeight: '100vh'
        }}
      >
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            {getBackAction() && (
              <Button
                variant="ghost"
                size="sm"
                onClick={getBackAction()!}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('log_viewer.back')}
              </Button>
            )}

            {/* 面包屑导航 */}
            <nav className="flex items-center space-x-1 text-sm">
              {getBreadcrumbs().map((breadcrumb, index) => (
                <React.Fragment key={breadcrumb.id}>
                  {index > 0 && (
                    <span className="text-gray-400 mx-1">/</span>
                  )}
                  {index === getBreadcrumbs().length - 1 ? (
                    <span className="text-gray-900 font-medium">
                      {breadcrumb.label}
                    </span>
                  ) : (
                    <button
                      onClick={breadcrumb.onClick}
                      className="text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      {breadcrumb.label}
                    </button>
                  )}
                </React.Fragment>
              ))}
            </nav>
          </div>
          <div className="flex gap-2">
            {selectedFile && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleGroupByReqId}
                  className={groupByReqId ? 'bg-blue-100 text-blue-700' : ''}
                >
                  <Layers className="h-4 w-4 mr-2" />
                  {groupByReqId ? t('log_viewer.grouped_on') : t('log_viewer.group_by_req_id')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={autoRefresh ? 'bg-blue-100 text-blue-700' : ''}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
                  {autoRefresh ? t('log_viewer.auto_refresh_on') : t('log_viewer.auto_refresh_off')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadLogs}
                  disabled={logs.length === 0}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {t('log_viewer.download')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearLogs}
                  disabled={logs.length === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('log_viewer.clear')}
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4 mr-2" />
              {t('log_viewer.close')}
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-gray-50">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : selectedFile ? (
            <>
              {groupByReqId && groupedLogs && !selectedReqId ? (
                // 显示日志组列表
                <div className="flex flex-col h-full p-6">
                  <div className="mb-4 flex-shrink-0">
                    <h3 className="text-lg font-medium mb-2">{t('log_viewer.request_groups')}</h3>
                    <p className="text-sm text-gray-600">
                      {t('log_viewer.total_requests')}: {groupedLogs.summary.totalRequests} |
                      {t('log_viewer.total_logs')}: {groupedLogs.summary.totalLogs}
                    </p>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
                    {groupedLogs.summary.requests.map((request) => (
                      <div
                        key={request.reqId}
                        className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => selectReqId(request.reqId)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <File className="h-5 w-5 text-blue-600" />
                            <span className="font-medium text-sm">{request.reqId}</span>
                            {request.model && (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                {request.model}
                              </span>
                            )}
                          </div>
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            {request.logCount} {t('log_viewer.logs')}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 space-y-1">
                          <div>{t('log_viewer.first_log')}: {formatDate(request.firstLog)}</div>
                          <div>{t('log_viewer.last_log')}: {formatDate(request.lastLog)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                // 显示日志内容
                <Editor
                  height="100%"
                  defaultLanguage="json"
                  value={formatLogsForEditor()}
                  theme="vs"
                  options={{
                    minimap: { enabled: true },
                    fontSize: 14,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    wordWrap: 'on',
                    readOnly: true,
                    lineNumbers: 'on',
                    folding: true,
                    renderWhitespace: 'all',
                  }}
                />
              )}
            </>
          ) : (
            <div className="p-6">
              <h3 className="text-lg font-medium mb-4">{t('log_viewer.select_file')}</h3>
              {logFiles.length === 0 ? (
                <div className="text-gray-500 text-center py-8">
                  <File className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>{t('log_viewer.no_log_files_available')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {logFiles.map((file) => (
                    <div
                      key={file.path}
                      className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => selectFile(file)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <File className="h-5 w-5 text-blue-600" />
                          <span className="font-medium text-sm">{file.name}</span>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 space-y-1">
                        <div>{formatFileSize(file.size)}</div>
                        <div>{formatDate(file.lastModified)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
