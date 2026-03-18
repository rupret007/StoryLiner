import type { Platform } from "@prisma/client";

export interface StreamDestinationConfig {
  platform: Platform;
  streamKey?: string;
  rtmpUrl?: string;
  streamTitle?: string;
  metadata?: Record<string, unknown>;
}

export interface StreamStartResult {
  success: boolean;
  externalStreamId?: string;
  dashboardUrl?: string;
  errorMessage?: string;
}

export interface LivestreamAdapterCapabilities {
  canStartStream: boolean;
  canEndStream: boolean;
  canScheduleStream: boolean;
  canUpdateTitle: boolean;
  supportsRtmp: boolean;
  supportsSimulcast: boolean;
}

export abstract class LivestreamProviderAdapter {
  abstract readonly platform: Platform;
  abstract readonly capabilities: LivestreamAdapterCapabilities;
  abstract readonly adapterName: string;

  abstract startStream(config: StreamDestinationConfig): Promise<StreamStartResult>;
  abstract endStream(externalStreamId: string): Promise<boolean>;
  abstract updateStreamTitle(externalStreamId: string, title: string): Promise<boolean>;
  abstract validateCredentials(): Promise<boolean>;
}
