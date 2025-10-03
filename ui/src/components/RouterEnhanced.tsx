import { useTranslation } from "react-i18next";
import { useConfig } from "@/components/ConfigProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo, useEffect } from "react";

/**
 * Enhanced Router component with tabbed interface for:
 * - Basic configuration (existing model selection)
 * - Routes management (view, enable/disable, reorder)
 * - Pre-processors management (view, enable/disable)
 * - Advanced settings (telemetry, debug, cache)
 */
export default function RouterEnhanced() {
  const { t } = useTranslation();
  const { config, setConfig } = useConfig();
  const [activeTab, setActiveTab] = useState("basic");

  // Helper function to safely update config
  const updateConfig = (newConfig: any) => {
    if (config) {
      setConfig({ ...config, ...newConfig });
    }
  };

  // Get all available models from providers
  const availableModels = useMemo(() => {
    if (!config?.Providers) return [];
    return config.Providers.flatMap((provider: any) =>
      (provider.models || []).map((model: string) => ({
        provider: provider.name,
        model,
        value: `${provider.name},${model}`,
        label: `${provider.name}/${model}`,
      }))
    );
  }, [config?.Providers]);

  // Routes data - will be populated when backend route system is integrated (task 20-21)
  // For now, showing placeholder for future advanced routing system
  const routes: any[] = [];

  // Pre-processors data - will be populated when PreProcessorManager is integrated (task 21)
  // For now, showing placeholder for future pre-processor pipeline
  const preprocessors: any[] = [];

  // Handlers for future route/preprocessor management
  // Will be implemented when backend routing system is integrated (task 20-21)
  const handleRouteToggle = (routeId: string, enabled: boolean) => {
    // TODO: Update config.Router.routes[routeId].enabled when route system is integrated
    console.log('Route toggle (not yet implemented):', routeId, enabled);
  };

  const handleRouteReorder = (routeId: string, direction: "up" | "down") => {
    // TODO: Update config.Router.routes order when route system is integrated
    console.log('Route reorder (not yet implemented):', routeId, direction);
  };

  const handlePreprocessorToggle = (name: string, enabled: boolean) => {
    // TODO: Update config.PreProcessors[name].enabled when preprocessor system is integrated
    console.log('Preprocessor toggle (not yet implemented):', name, enabled);
  };

  // Model selector component
  const ModelSelector = ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
  }) => {
    const [open, setOpen] = useState(false);
    const selectedModel = availableModels.find((m) => m.value === value);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {selectedModel ? selectedModel.label : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0">
          <Command>
            <CommandInput placeholder={t("router.searchModel")} />
            <CommandList>
              <CommandEmpty>{t("router.noModelFound")}</CommandEmpty>
              <CommandGroup>
                {availableModels.map((model) => (
                  <CommandItem
                    key={model.value}
                    value={model.value}
                    onSelect={(currentValue) => {
                      onChange(currentValue);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === model.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {model.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  };

  if (!config) {
    return <div>Loading configuration...</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">{t("router.title")}</h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basic">{t("router.tabs.basic")}</TabsTrigger>
          <TabsTrigger value="routes">{t("router.tabs.routes")}</TabsTrigger>
          <TabsTrigger value="preprocessors">
            {t("router.tabs.preprocessors")}
          </TabsTrigger>
          <TabsTrigger value="advanced">{t("router.tabs.advanced")}</TabsTrigger>
        </TabsList>

        {/* Basic Configuration Tab */}
        <TabsContent value="basic" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("router.title")}</CardTitle>
              <CardDescription>
                Configure basic model routing for different scenarios
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Default Model */}
              <div className="grid gap-2">
                <Label htmlFor="default-model">{t("router.default")}</Label>
                <ModelSelector
                  value={config?.Router?.default || ""}
                  onChange={(value) => {
                    updateConfig({
                      ...config,
                      Router: { ...config.Router, default: value },
                    });
                  }}
                  placeholder={t("router.selectModel")}
                />
              </div>

              {/* Background Model */}
              <div className="grid gap-2">
                <Label htmlFor="background-model">{t("router.background")}</Label>
                <ModelSelector
                  value={config?.Router?.background || ""}
                  onChange={(value) => {
                    updateConfig({
                      ...config,
                      Router: { ...config.Router, background: value },
                    });
                  }}
                  placeholder={t("router.selectModel")}
                />
              </div>

              {/* Think Model */}
              <div className="grid gap-2">
                <Label htmlFor="think-model">{t("router.think")}</Label>
                <ModelSelector
                  value={config?.Router?.think || ""}
                  onChange={(value) => {
                    updateConfig({
                      ...config,
                      Router: { ...config.Router, think: value },
                    });
                  }}
                  placeholder={t("router.selectModel")}
                />
              </div>

              {/* Long Context Model */}
              <div className="grid gap-2">
                <Label htmlFor="longContext-model">{t("router.longContext")}</Label>
                <ModelSelector
                  value={config?.Router?.longContext || ""}
                  onChange={(value) => {
                    updateConfig({
                      ...config,
                      Router: { ...config.Router, longContext: value },
                    });
                  }}
                  placeholder={t("router.selectModel")}
                />
                <Label htmlFor="longContext-threshold">
                  {t("router.longContextThreshold")}
                </Label>
                <Input
                  id="longContext-threshold"
                  type="number"
                  value={config?.Router?.longContextThreshold || 60000}
                  onChange={(e) => {
                    updateConfig({
                      ...config,
                      Router: {
                        ...config.Router,
                        longContextThreshold: parseInt(e.target.value),
                      },
                    });
                  }}
                />
              </div>

              {/* Web Search Model */}
              <div className="grid gap-2">
                <Label htmlFor="webSearch-model">{t("router.webSearch")}</Label>
                <ModelSelector
                  value={config?.Router?.webSearch || ""}
                  onChange={(value) => {
                    updateConfig({
                      ...config,
                      Router: { ...config.Router, webSearch: value },
                    });
                  }}
                  placeholder={t("router.selectModel")}
                />
              </div>

              {/* Compact Model */}
              <div className="grid gap-2">
                <Label htmlFor="compact-model">{t("router.compact")}</Label>
                <ModelSelector
                  value={config?.Router?.compact || ""}
                  onChange={(value) => {
                    updateConfig({
                      ...config,
                      Router: { ...config.Router, compact: value },
                    });
                  }}
                  placeholder={t("router.selectModel")}
                />
              </div>

              {/* Ultrathink Model */}
              <div className="grid gap-2">
                <Label htmlFor="ultrathink-model">{t("router.ultrathink")}</Label>
                <ModelSelector
                  value={config?.Router?.ultrathink || ""}
                  onChange={(value) => {
                    updateConfig({
                      ...config,
                      Router: { ...config.Router, ultrathink: value },
                    });
                  }}
                  placeholder={t("router.selectModel")}
                />
              </div>

              {/* Image Model */}
              <div className="grid gap-2">
                <Label htmlFor="image-model">{t("router.image")}</Label>
                <ModelSelector
                  value={config?.Router?.image || ""}
                  onChange={(value) => {
                    updateConfig({
                      ...config,
                      Router: { ...config.Router, image: value },
                    });
                  }}
                  placeholder={t("router.selectModel")}
                />
                <div className="flex items-center space-x-2">
                  <Switch
                    id="forceUseImageAgent"
                    checked={config?.Router?.forceUseImageAgent || false}
                    onCheckedChange={(checked) => {
                      updateConfig({
                        ...config,
                        Router: { ...config.Router, forceUseImageAgent: checked },
                      });
                    }}
                  />
                  <Label htmlFor="forceUseImageAgent">
                    {t("router.forceUseImageAgent")}
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Routes Management Tab */}
        <TabsContent value="routes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("router.routes.title")}</CardTitle>
              <CardDescription>{t("router.routes.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              {routes.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  {t("router.routes.no_routes")}
                </div>
              ) : (
                <div className="space-y-3">
                  {routes.map((route, index) => (
                    <Card key={route.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">P{route.priority}</Badge>
                            <h4 className="font-semibold">{route.id}</h4>
                            <Badge
                              variant={route.enabled ? "default" : "secondary"}
                            >
                              {route.enabled
                                ? t("router.routes.enabled")
                                : t("router.routes.disabled")}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {route.description}
                          </p>
                          <div className="flex items-center gap-2">
                            {route.tags.map((tag: string) => (
                              <Badge key={tag} variant="secondary">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                          <div className="text-sm">
                            <span className="font-medium">
                              {t("router.routes.provider")}:
                            </span>{" "}
                            {route.provider} / {route.model}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 ml-4">
                          <Switch
                            checked={route.enabled}
                            onCheckedChange={(checked) =>
                              handleRouteToggle(route.id, checked)
                            }
                          />
                          <div className="flex flex-col gap-1">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() => handleRouteReorder(route.id, "up")}
                              disabled={index === 0}
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() => handleRouteReorder(route.id, "down")}
                              disabled={index === routes.length - 1}
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pre-Processors Tab */}
        <TabsContent value="preprocessors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("router.preprocessors.title")}</CardTitle>
              <CardDescription>
                {t("router.preprocessors.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {preprocessors.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  {t("router.preprocessors.no_preprocessors")}
                </div>
              ) : (
                <div className="space-y-3">
                  {preprocessors.map((processor) => (
                    <Card key={processor.name} className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">P{processor.priority}</Badge>
                            <h4 className="font-semibold">{processor.name}</h4>
                            <Badge
                              variant={processor.enabled ? "default" : "secondary"}
                            >
                              {processor.enabled
                                ? t("router.preprocessors.enabled")
                                : t("router.preprocessors.disabled")}
                            </Badge>
                            {processor.builtin && (
                              <Badge variant="secondary">
                                {t("router.preprocessors.builtin")}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {processor.description}
                          </p>
                        </div>
                        <div className="ml-4">
                          <Switch
                            checked={processor.enabled}
                            onCheckedChange={(checked) =>
                              handlePreprocessorToggle(processor.name, checked)
                            }
                          />
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Settings Tab */}
        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("router.advanced.title")}</CardTitle>
              <CardDescription>{t("router.advanced.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Telemetry */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{t("router.advanced.telemetry")}</h4>
                    <p className="text-sm text-muted-foreground">
                      {t("router.advanced.enable_telemetry")}
                    </p>
                  </div>
                  <Switch
                    checked={config?.Router?.telemetry?.enabled || false}
                    onCheckedChange={(checked) => {
                      updateConfig({
                        ...config,
                        Router: {
                          ...config.Router,
                          telemetry: {
                            ...config.Router?.telemetry,
                            enabled: checked,
                          },
                        },
                      });
                    }}
                  />
                </div>
              </div>

              {/* Debug Mode */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium">{t("router.advanced.debug_mode")}</h4>
                    <p className="text-sm text-muted-foreground">
                      {t("router.advanced.enable_debug")}
                    </p>
                  </div>
                  <Switch
                    checked={config?.Router?.debug || false}
                    onCheckedChange={(checked) => {
                      updateConfig({
                        ...config,
                        Router: { ...config.Router, debug: checked },
                      });
                    }}
                  />
                </div>
              </div>

              {/* Cache Settings */}
              <div className="space-y-2">
                <h4 className="font-medium">{t("router.advanced.cache_settings")}</h4>
                <Button
                  variant="outline"
                  onClick={() => {
                    // TODO: Implement cache clearing
                    console.log("Clear route cache");
                  }}
                >
                  {t("router.advanced.clear_cache")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
