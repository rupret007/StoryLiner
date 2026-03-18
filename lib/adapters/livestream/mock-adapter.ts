import type { Platform } from "@prisma/client";
import {
  LivestreamProviderAdapter,
  type StreamDestinationConfig,
  type StreamStartResult,
  type LivestreamAdapterCapabilities,
} from "./base";

class MockLivestreamAdapter extends LivestreamProviderAdapter {
  constructor(
    public readonly platform: Platform,
    public readonly capabilities: LivestreamAdapterCapabilities,
    public readonly adapterName: string
  ) {
    super();
  }

  async startStream(config: StreamDestinationConfig): Promise<StreamStartResult> {
    const id = `mock_stream_${Date.now()}`;
    console.log(`[mock livestream] Starting stream on ${config.platform}: ${config.streamTitle}`);
    return {
      success: true,
      externalStreamId: id,
      dashboardUrl: `https://mock-${this.platform.toLowerCase()}.example.com/stream/${id}`,
    };
  }

  async endStream(externalStreamId: string): Promise<boolean> {
    console.log(`[mock livestream] Ended stream ${externalStreamId}`);
    return true;
  }

  async updateStreamTitle(externalStreamId: string, title: string): Promise<boolean> {
    console.log(`[mock livestream] Updated title for ${externalStreamId}: ${title}`);
    return true;
  }

  async validateCredentials(): Promise<boolean> {
    return true;
  }
}

export const mockYoutubeLiveAdapter = new MockLivestreamAdapter(
  "YOUTUBE",
  {
    canStartStream: true,
    canEndStream: true,
    canScheduleStream: true,
    canUpdateTitle: true,
    supportsRtmp: true,
    supportsSimulcast: false,
  },
  "mock-youtube-live"
);

export const mockTwitchLiveAdapter = new MockLivestreamAdapter(
  "TWITCH",
  {
    canStartStream: false, // Twitch start via OBS/RTMP only
    canEndStream: false,
    canScheduleStream: true,
    canUpdateTitle: true,
    supportsRtmp: true,
    supportsSimulcast: false,
  },
  "mock-twitch-live"
);
