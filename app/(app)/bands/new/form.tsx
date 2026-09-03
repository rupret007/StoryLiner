"use client";

import { useActionState } from "react";
import { createBandAction, type BandSetupState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: BandSetupState = {};

export function BandSetupForm() {
  const [state, action, pending] = useActionState(createBandAction, initialState);

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="name">Band name</Label>
          <Input id="name" name="name" maxLength={80} required autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="genre">Genre</Label>
          <Input id="genre" name="genre" maxLength={100} placeholder="Pop-punk" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">Home base</Label>
          <Input id="location" name="location" maxLength={100} placeholder="Dallas–Fort Worth" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="founded">Founded</Label>
          <Input id="founded" name="founded" maxLength={20} placeholder="2024" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="coverColor">Band color</Label>
          <Input
            id="coverColor"
            name="coverColor"
            type="color"
            defaultValue="#6d28d9"
            className="h-10 p-1"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">What should StoryLiner know?</Label>
          <Textarea
            id="description"
            name="description"
            maxLength={500}
            placeholder="The band, the audience, and what makes the project distinct."
          />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-5 space-y-5">
        <div>
          <h2 className="font-semibold text-foreground">Start the voice boundary</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These facts stay scoped to this band and guide every generated draft.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="toneDescription">Describe how the band sounds in writing</Label>
          <Textarea
            id="toneDescription"
            name="toneDescription"
            minLength={10}
            maxLength={1000}
            required
            placeholder="Direct, funny, scrappy, and warm—like talking with friends after the show."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="personalityTraits">Voice traits</Label>
          <Input
            id="personalityTraits"
            name="personalityTraits"
            maxLength={300}
            required
            placeholder="warm, funny, direct"
          />
          <p className="text-xs text-muted-foreground">Separate traits with commas.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="bannedPhrases">Phrases this band should never use</Label>
          <Input
            id="bannedPhrases"
            name="bannedPhrases"
            maxLength={500}
            placeholder="game-changer, thrilled to announce"
          />
          <p className="text-xs text-muted-foreground">Optional; separate phrases with commas.</p>
        </div>
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating band…" : "Create band"}
        </Button>
      </div>
      <p className="text-right text-xs text-muted-foreground">
        This creates StoryLiner workspace data only. It does not connect accounts, schedule, or publish.
      </p>
    </form>
  );
}
