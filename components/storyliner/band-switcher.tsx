"use client";

import * as React from "react";
import { Check, ChevronsUpDown, PlusCircle, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useRouter, useSearchParams } from "next/navigation";

interface Band {
  id: string;
  name: string;
  slug: string;
  coverColor: string;
}

interface BandSwitcherProps {
  bands: Band[];
  activeBandId?: string;
}

export function BandSwitcher({ bands, activeBandId }: BandSwitcherProps) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedBand = bands.find((band) => band.id === activeBandId) || bands[0];

  const onBandSelect = (band: Band) => {
    setOpen(false);
    
    // Update the URL with the new bandId
    const params = new URLSearchParams(searchParams.toString());
    params.set("bandId", band.id);
    
    // Also set a cookie for persistence (simple client-side approach)
    document.cookie = `activeBandId=${band.id}; path=/; max-age=31536000`;
    
    router.push(`?${params.toString()}`);
    router.refresh();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label="Select a band"
          className={cn("w-full justify-between gap-2 px-2 hover:bg-sidebar-accent", !selectedBand && "text-muted-foreground")}
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <div 
              className="h-5 w-5 rounded-md shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
              style={{ backgroundColor: selectedBand?.coverColor || "#333" }}
            >
              {selectedBand?.name.charAt(0)}
            </div>
            <span className="truncate font-medium text-xs">
              {selectedBand?.name || "Select Band"}
            </span>
          </div>
          <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandList>
            <CommandInput placeholder="Search band..." />
            <CommandEmpty>No band found.</CommandEmpty>
            <CommandGroup heading="Bands">
              {bands.map((band) => (
                <CommandItem
                  key={band.id}
                  onSelect={() => onBandSelect(band)}
                  className="text-sm cursor-pointer"
                >
                  <div 
                    className="mr-2 h-4 w-4 rounded-sm flex items-center justify-center text-[8px] font-bold text-white"
                    style={{ backgroundColor: band.coverColor }}
                  >
                    {band.name.charAt(0)}
                  </div>
                  {band.name}
                  <Check
                    className={cn(
                      "ml-auto h-4 w-4",
                      selectedBand?.id === band.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <CommandSeparator />
          <CommandList>
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  router.push("/bands/new");
                }}
                className="text-sm cursor-pointer"
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Band
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
