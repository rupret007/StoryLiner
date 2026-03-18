import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  const llmAdapter = process.env.LLM_ADAPTER ?? "mock";
  const socialAdapter = process.env.SOCIAL_ADAPTER ?? "mock";

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Adapter Mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">LLM Adapter</Label>
              <p className="text-xs text-muted-foreground">
                Controls which AI provider generates content
              </p>
            </div>
            <Badge variant={llmAdapter === "mock" ? "secondary" : "success"}>
              {llmAdapter}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Social Adapter</Label>
              <p className="text-xs text-muted-foreground">
                Controls how posts are published
              </p>
            </div>
            <Badge variant={socialAdapter === "mock" ? "secondary" : "success"}>
              {socialAdapter}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground pt-2 border-t border-border">
            Change adapters via environment variables. See .env.example for available options.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Publishing Safety</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Require review before scheduling</Label>
              <p className="text-xs text-muted-foreground">
                All drafts must be approved before they can be scheduled
              </p>
            </div>
            <Switch checked disabled />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Auto-publish</Label>
              <p className="text-xs text-muted-foreground">
                Disabled by policy. Content always goes through review.
              </p>
            </div>
            <Switch checked={false} disabled />
          </div>
          <p className="text-xs text-muted-foreground pt-2 border-t border-border">
            These settings are enforced at the service layer and cannot be overridden from the UI. See <code className="text-xs bg-muted px-1 rounded">lib/services/guardrails/policy.ts</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Guardrail Policy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {[
            "Never sound like a LinkedIn influencer",
            "Never overuse emojis or exclamation marks",
            "Never generate fake accomplishments",
            "Never mix band voices",
            "Never auto-publish",
            "Never use obvious AI phrases",
          ].map((rule, i) => (
            <div key={i} className="flex items-center gap-2 text-muted-foreground">
              <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
              {rule}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
