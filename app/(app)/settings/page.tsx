import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PROMO_PIPELINE_PATH,
  operatorPathPolicy,
} from "@/lib/services/publish/review-desk";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  const llmAdapter = process.env.LLM_ADAPTER ?? "mock";
  const socialAdapter = process.env.SOCIAL_ADAPTER ?? "mock";
  const policy = operatorPathPolicy({
    llmAdapter,
    socialAdapter,
  });

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Operator path</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium text-foreground">{PROMO_PIPELINE_PATH}</p>
          <p className="text-xs text-muted-foreground">
            These are enforced in Generate, review, schedule, and the worker.
            Settings cannot turn on auto-publish or add a desk Publish button.
          </p>
          <dl className="space-y-3">
            {policy.map((row) => (
              <div
                key={row.label}
                className="flex items-start justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0"
              >
                <div>
                  <dt className="text-sm text-foreground">{row.label}</dt>
                  <dd className="text-xs text-muted-foreground">{row.value}</dd>
                </div>
                <Badge variant="secondary">Locked</Badge>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Adapter readout</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm">LLM_ADAPTER</p>
            <Badge variant={llmAdapter === "mock" ? "secondary" : "success"}>
              {llmAdapter}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm">SOCIAL_ADAPTER</p>
            <Badge variant={socialAdapter === "mock" ? "secondary" : "success"}>
              {socialAdapter}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground pt-2 border-t border-border">
            Change adapters via environment variables, then restart. A UI
            switch cannot override the connected-account gate or send a
            leftover platform live.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
