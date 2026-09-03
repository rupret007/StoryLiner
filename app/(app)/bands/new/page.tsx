import Link from "next/link";
import { ArrowLeft, Music2 } from "lucide-react";
import { BandSetupForm } from "./form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Add Band" };

export default function NewBandPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/bands" aria-label="Back to bands">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <div className="flex items-center gap-2">
            <Music2 className="h-5 w-5 text-primary" aria-hidden="true" />
            <h1 className="text-xl font-bold text-foreground">Add a band</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            One short setup creates the identity and voice boundary StoryLiner needs.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Band essentials</CardTitle>
        </CardHeader>
        <CardContent>
          <BandSetupForm />
        </CardContent>
      </Card>
    </div>
  );
}
