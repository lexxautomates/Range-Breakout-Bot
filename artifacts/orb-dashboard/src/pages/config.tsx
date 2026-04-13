import { useGetConfig, useUpdateConfig } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetConfigQueryKey } from "@workspace/api-client-react";

type LlmProvider = "none" | "claude" | "openrouter" | "ollama";
type BrokerName = "alpaca" | "ibkr" | "cryptocom";

interface ConfigForm {
  openingRangeMinutes: number;
  riskPercent: number;
  rewardRiskRatio: number;
  requireVolumeConfirmation: boolean;
  volumeMultiplier: number;
  trailingStopEnabled: boolean;
  trailingStopActivationR: number;
  reEntryEnabled: boolean;
  maxOrbWidthPercent: number;
  minOrbWidthPercent: number;
  breakoutWindowMinutes: number;
  useModerateRisk: boolean;
  evolutionThreshold: number;
  autoStartTopN: number;
  llmProvider: LlmProvider;
  llmModel: string;
  llmApiKey: string;
  llmBaseUrl: string;
  llmTemperature: number;
  llmConfidenceThreshold: number;
  defaultBroker: BrokerName;
  ibkrBaseUrl: string;
  cryptocomApiKey: string;
  cryptocomApiSecret: string;
}

function NumberField({ label, id, value, onChange, step = 0.1, min = 0, help }: {
  label: string;
  id: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  help?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      <Input
        id={id}
        type="number"
        step={step}
        min={min}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="font-mono"
      />
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

function TextField({ label, id, value, onChange, placeholder, help, type = "text" }: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  help?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="font-mono"
      />
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

function ToggleField({ label, id, checked, onChange, help }: {
  label: string;
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  help?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
        {help && <p className="text-xs text-muted-foreground">{help}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SelectField({ label, id, value, onChange, options, help }: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  help?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  );
}

const LLM_PROVIDER_OPTIONS: { value: LlmProvider; label: string }[] = [
  { value: "none", label: "None (rule-based only)" },
  { value: "claude", label: "Claude (Anthropic)" },
  { value: "openrouter", label: "OpenRouter (Hermes, GPT-4, etc.)" },
  { value: "ollama", label: "Ollama (local LLM)" },
];

const CLAUDE_MODEL_OPTIONS = [
  "claude-3-5-haiku-20241022",
  "claude-3-5-sonnet-20241022",
  "claude-3-opus-20240229",
];

const OPENROUTER_MODEL_SUGGESTIONS = [
  "nousresearch/hermes-3-llama-3.1-70b",
  "nousresearch/hermes-3-llama-3.1-405b",
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
  "anthropic/claude-3.5-haiku",
  "meta-llama/llama-3.1-70b-instruct",
];

const OLLAMA_MODEL_SUGGESTIONS = [
  "hermes3",
  "hermes3:70b",
  "llama3.1",
  "llama3.1:70b",
  "mistral",
  "phi3",
];

const BROKER_OPTIONS: { value: BrokerName; label: string }[] = [
  { value: "alpaca", label: "Alpaca (paper/live stocks)" },
  { value: "ibkr", label: "IBKR (Interactive Brokers)" },
  { value: "cryptocom", label: "Crypto.com (spot crypto)" },
];

export default function Config() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useGetConfig({ query: { refetchInterval: false } });
  const updateConfig = useUpdateConfig({
    mutation: {
      onSuccess: () => {
        toast({ title: "Configuration saved" });
        queryClient.invalidateQueries({ queryKey: getGetConfigQueryKey() });
      },
      onError: (err) => {
        toast({ title: "Failed to save config", description: String(err), variant: "destructive" });
      }
    }
  });

  const [form, setForm] = useState<ConfigForm | null>(null);

  useEffect(() => {
    if (config && !form) {
      setForm({
        openingRangeMinutes: config.openingRangeMinutes,
        riskPercent: config.riskPercent,
        rewardRiskRatio: config.rewardRiskRatio,
        requireVolumeConfirmation: config.requireVolumeConfirmation,
        volumeMultiplier: config.volumeMultiplier,
        trailingStopEnabled: config.trailingStopEnabled,
        trailingStopActivationR: config.trailingStopActivationR,
        reEntryEnabled: config.reEntryEnabled,
        maxOrbWidthPercent: config.maxOrbWidthPercent,
        minOrbWidthPercent: config.minOrbWidthPercent,
        breakoutWindowMinutes: config.breakoutWindowMinutes,
        useModerateRisk: config.useModerateRisk,
        evolutionThreshold: config.evolutionThreshold,
        autoStartTopN: config.autoStartTopN,
        llmProvider: (config.llmProvider as LlmProvider) || "none",
        llmModel: config.llmModel || "",
        llmApiKey: config.llmApiKey || "",
        llmBaseUrl: config.llmBaseUrl || "",
        llmTemperature: config.llmTemperature ?? 0.2,
        llmConfidenceThreshold: config.llmConfidenceThreshold ?? 0.6,
        defaultBroker: (config.defaultBroker as BrokerName) || "alpaca",
        ibkrBaseUrl: config.ibkrBaseUrl || "",
        cryptocomApiKey: config.cryptocomApiKey || "",
        cryptocomApiSecret: config.cryptocomApiSecret || "",
      });
    }
  }, [config]);

  const set = <K extends keyof ConfigForm>(key: K, value: ConfigForm[K]) => {
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    updateConfig.mutate({ data: form });
  };

  if (isLoading || !form) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Bot Configuration</h1>
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      </div>
    );
  }

  const modelSuggestions =
    form.llmProvider === "claude"
      ? CLAUDE_MODEL_OPTIONS
      : form.llmProvider === "openrouter"
      ? OPENROUTER_MODEL_SUGGESTIONS
      : form.llmProvider === "ollama"
      ? OLLAMA_MODEL_SUGGESTIONS
      : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Bot Configuration</h1>
        <div className="text-xs text-muted-foreground">
          Last saved: {config?.updatedAt ? new Date(config.updatedAt).toLocaleString() : "---"}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── AI Advisor ─────────────────────────────────────────────── */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-medium">AI Advisor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <SelectField
              label="LLM Provider"
              id="llmProvider"
              value={form.llmProvider}
              onChange={(v) => set("llmProvider", v as LlmProvider)}
              options={LLM_PROVIDER_OPTIONS}
              help="Select the AI model that evaluates trade setups before entry"
            />

            {form.llmProvider !== "none" && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="llmModel" className="text-sm font-medium">Model</Label>
                  <Input
                    id="llmModel"
                    type="text"
                    value={form.llmModel}
                    onChange={(e) => set("llmModel", e.target.value)}
                    placeholder={modelSuggestions[0] ?? "model name"}
                    list="model-suggestions"
                    className="font-mono"
                  />
                  <datalist id="model-suggestions">
                    {modelSuggestions.map((m) => <option key={m} value={m} />)}
                  </datalist>
                  <p className="text-xs text-muted-foreground">
                    {form.llmProvider === "claude" && "e.g. claude-3-5-haiku-20241022 (fastest/cheapest) or claude-3-5-sonnet-20241022"}
                    {form.llmProvider === "openrouter" && "e.g. nousresearch/hermes-3-llama-3.1-70b — see openrouter.ai/models"}
                    {form.llmProvider === "ollama" && "e.g. hermes3 — must be pulled via: ollama pull hermes3"}
                  </p>
                </div>

                {(form.llmProvider === "claude" || form.llmProvider === "openrouter") && (
                  <TextField
                    label="API Key"
                    id="llmApiKey"
                    value={form.llmApiKey}
                    onChange={(v) => set("llmApiKey", v)}
                    type="password"
                    placeholder="sk-..."
                    help={
                      form.llmProvider === "claude"
                        ? "Anthropic API key — get one at console.anthropic.com"
                        : "OpenRouter API key — get one at openrouter.ai/keys"
                    }
                  />
                )}

                {(form.llmProvider === "openrouter" || form.llmProvider === "ollama") && (
                  <TextField
                    label="Base URL"
                    id="llmBaseUrl"
                    value={form.llmBaseUrl}
                    onChange={(v) => set("llmBaseUrl", v)}
                    placeholder={
                      form.llmProvider === "openrouter"
                        ? "https://openrouter.ai/api/v1"
                        : "http://localhost:11434"
                    }
                    help={
                      form.llmProvider === "ollama"
                        ? "Ollama server URL — default is http://localhost:11434"
                        : "Leave blank to use the default OpenRouter endpoint"
                    }
                  />
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <NumberField
                    label="Temperature"
                    id="llmTemperature"
                    value={form.llmTemperature}
                    onChange={(v) => set("llmTemperature", Math.min(2, Math.max(0, v)))}
                    step={0.05}
                    min={0}
                    help="Lower = more deterministic (0.2 recommended)"
                  />
                  <NumberField
                    label="Confidence Threshold"
                    id="llmConfidenceThreshold"
                    value={form.llmConfidenceThreshold}
                    onChange={(v) => set("llmConfidenceThreshold", Math.min(1, Math.max(0, v)))}
                    step={0.05}
                    min={0}
                    help="Minimum AI confidence (0–1) required to approve a trade"
                  />
                </div>

                <div className="rounded-md bg-muted/50 border border-border px-4 py-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">How it works</p>
                  <p>Before every trade entry, the bot sends a structured prompt to the selected AI model describing the ORB setup (symbol, direction, ORB width, volume ratio, R:R, etc.). The model replies with an approval decision and confidence score. If confidence is below the threshold, the trade is skipped and logged.</p>
                  <p>Set provider to <span className="font-mono">none</span> to disable AI gating (bots trade purely by rules).</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Broker ─────────────────────────────────────────────────── */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-medium">Broker</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <SelectField
              label="Active Broker"
              id="defaultBroker"
              value={form.defaultBroker}
              onChange={(v) => set("defaultBroker", v as BrokerName)}
              options={BROKER_OPTIONS}
              help="All bots will route orders through this broker"
            />

            {form.defaultBroker === "ibkr" && (
              <>
                <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-xs text-amber-200 space-y-1">
                  <p className="font-medium">IBKR Setup Required</p>
                  <p>Run <span className="font-mono">IB Gateway</span> or <span className="font-mono">TWS</span> locally and enable the Client Portal Web API. The bot connects to it via the URL below. IBKR requires manual login each session.</p>
                </div>
                <TextField
                  label="IBKR Client Portal URL"
                  id="ibkrBaseUrl"
                  value={form.ibkrBaseUrl}
                  onChange={(v) => set("ibkrBaseUrl", v)}
                  placeholder="https://localhost:5000/v1/api"
                  help="Base URL for the IBKR Client Portal Web API (default: https://localhost:5000/v1/api)"
                />
              </>
            )}

            {form.defaultBroker === "cryptocom" && (
              <>
                <div className="rounded-md bg-blue-500/10 border border-blue-500/30 px-4 py-3 text-xs text-blue-200 space-y-1">
                  <p className="font-medium">Crypto.com Exchange API</p>
                  <p>Create an API key at <span className="font-mono">crypto.com/exchange</span> → Settings → API Management. Enable Spot Trading permissions. Note: this connects to the live exchange — use a sub-account for safety.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <TextField
                    label="Crypto.com API Key"
                    id="cryptocomApiKey"
                    value={form.cryptocomApiKey}
                    onChange={(v) => set("cryptocomApiKey", v)}
                    type="password"
                    placeholder="API key"
                  />
                  <TextField
                    label="Crypto.com API Secret"
                    id="cryptocomApiSecret"
                    value={form.cryptocomApiSecret}
                    onChange={(v) => set("cryptocomApiSecret", v)}
                    type="password"
                    placeholder="API secret"
                  />
                </div>
              </>
            )}

            {form.defaultBroker === "alpaca" && (
              <div className="rounded-md bg-muted/50 border border-border px-4 py-3 text-xs text-muted-foreground">
                Using Alpaca paper trading account. API credentials are loaded from environment variables <span className="font-mono">ALPACA_API_KEY</span> and <span className="font-mono">ALPACA_API_SECRET</span>.
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Opening Range ──────────────────────────────────────────── */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-medium">Opening Range</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <NumberField
              label="Opening Range Minutes"
              id="openingRangeMinutes"
              value={form.openingRangeMinutes}
              onChange={(v) => set("openingRangeMinutes", Math.round(v))}
              step={1}
              min={1}
              help="Minutes after 9:30 AM to define the ORB (default: 15)"
            />
            <NumberField
              label="Breakout Window (minutes)"
              id="breakoutWindowMinutes"
              value={form.breakoutWindowMinutes}
              onChange={(v) => set("breakoutWindowMinutes", Math.round(v))}
              step={30}
              min={30}
              help="Minutes after ORB window to allow breakout entries (default: 240)"
            />
            <NumberField
              label="Min ORB Width (%)"
              id="minOrbWidthPercent"
              value={form.minOrbWidthPercent}
              onChange={(v) => set("minOrbWidthPercent", v)}
              step={0.05}
              min={0}
              help="Skip if range is too narrow (default: 0.1%)"
            />
            <NumberField
              label="Max ORB Width (%)"
              id="maxOrbWidthPercent"
              value={form.maxOrbWidthPercent}
              onChange={(v) => set("maxOrbWidthPercent", v)}
              step={0.1}
              min={0}
              help="Skip if range is too wide (default: 3.0%)"
            />
          </CardContent>
        </Card>

        {/* ── Risk Management ────────────────────────────────────────── */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-medium">Risk Management</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <NumberField
              label="Risk Per Trade (%)"
              id="riskPercent"
              value={form.riskPercent}
              onChange={(v) => set("riskPercent", v)}
              step={0.1}
              min={0.1}
              help="Max % of account equity risked per trade (default: 1%)"
            />
            <NumberField
              label="Reward:Risk Ratio"
              id="rewardRiskRatio"
              value={form.rewardRiskRatio}
              onChange={(v) => set("rewardRiskRatio", v)}
              step={0.25}
              min={0.5}
              help="Take profit at this multiple of risk (default: 2R)"
            />
            <div className="md:col-span-2">
              <ToggleField
                label="Use Moderate Risk (midpoint stop)"
                id="useModerateRisk"
                checked={form.useModerateRisk}
                onChange={(v) => set("useModerateRisk", v)}
                help="Use ORB midpoint as stop instead of opposite side of the range"
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Volume Confirmation ────────────────────────────────────── */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-medium">Volume Confirmation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <ToggleField
              label="Require Volume Confirmation"
              id="requireVolumeConfirmation"
              checked={form.requireVolumeConfirmation}
              onChange={(v) => set("requireVolumeConfirmation", v)}
              help="Only enter trades with above-average volume"
            />
            {form.requireVolumeConfirmation && (
              <NumberField
                label="Volume Multiplier"
                id="volumeMultiplier"
                value={form.volumeMultiplier}
                onChange={(v) => set("volumeMultiplier", v)}
                step={0.1}
                min={1}
                help="Volume must be this many times the per-minute average (default: 1.5x)"
              />
            )}
          </CardContent>
        </Card>

        {/* ── Advanced ───────────────────────────────────────────────── */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-medium">Advanced</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <ToggleField
              label="Trailing Stop"
              id="trailingStopEnabled"
              checked={form.trailingStopEnabled}
              onChange={(v) => set("trailingStopEnabled", v)}
              help="Move stop to break-even after reaching activation threshold"
            />
            {form.trailingStopEnabled && (
              <NumberField
                label="Trailing Stop Activation (R)"
                id="trailingStopActivationR"
                value={form.trailingStopActivationR}
                onChange={(v) => set("trailingStopActivationR", v)}
                step={0.25}
                min={0.5}
                help="Activate trailing stop once trade reaches this R-multiple (default: 1R)"
              />
            )}
            <ToggleField
              label="Allow Re-entry"
              id="reEntryEnabled"
              checked={form.reEntryEnabled}
              onChange={(v) => set("reEntryEnabled", v)}
              help="Allow trading the same direction again after a stop-out"
            />
          </CardContent>
        </Card>

        {/* ── Swarm & Evolution ──────────────────────────────────────── */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider font-medium">Swarm & Evolution</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <NumberField
              label="Evolution Threshold (trades)"
              id="evolutionThreshold"
              value={form.evolutionThreshold}
              onChange={(v) => set("evolutionThreshold", Math.max(1, Math.round(v)))}
              step={1}
              min={1}
              help="After this many trades, each bot mutates one parameter and advances to the next generation"
            />
            <NumberField
              label="Auto-Start Top N (scanner)"
              id="autoStartTopN"
              value={form.autoStartTopN}
              onChange={(v) => set("autoStartTopN", Math.max(0, Math.round(v)))}
              step={1}
              min={0}
              help="At 9:25 AM ET, auto-start this many top gap candidates (0 = disabled)"
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" className="w-full md:w-auto" disabled={updateConfig.isPending}>
            {updateConfig.isPending ? "Saving..." : "Save Configuration"}
          </Button>
        </div>
      </form>
    </div>
  );
}
