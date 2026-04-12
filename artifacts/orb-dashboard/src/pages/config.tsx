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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Bot Configuration</h1>
        <div className="text-xs text-muted-foreground">
          Last saved: {config?.updatedAt ? new Date(config.updatedAt).toLocaleString() : "---"}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
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

        <div className="flex justify-end">
          <Button type="submit" className="w-full md:w-auto" disabled={updateConfig.isPending}>
            {updateConfig.isPending ? "Saving..." : "Save Configuration"}
          </Button>
        </div>
      </form>
    </div>
  );
}
