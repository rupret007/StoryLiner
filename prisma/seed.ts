import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding StoryLiner...");

  // ─── User ────────────────────────────────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { id: "user_operator_01" },
    create: { id: "user_operator_01", name: "Operator" },
    update: {},
  });

  // ─── Band: Stalemate ─────────────────────────────────────────────────────────
  const stalemate = await prisma.band.upsert({
    where: { slug: "stalemate" },
    create: {
      userId: user.id,
      name: "Stalemate",
      slug: "stalemate",
      description:
        "An original band built on tight grooves, honest lyrics, and the kind of set that leaves the room a little quieter when it's over. No gimmicks.",
      genre: "Indie Rock / Post-Hardcore",
      location: "Chicago, IL",
      founded: "2019",
      coverColor: "#5b21b6",
    },
    update: {},
  });

  // Stalemate voice profile
  await prisma.bandVoiceProfile.upsert({
    where: { bandId: stalemate.id },
    create: {
      bandId: stalemate.id,
      toneDescription:
        "Dry. Direct. Slightly self-aware but never self-deprecating for comedic effect. Stalemate writes like someone who's been in the scene long enough to stop trying to impress it. The voice is honest, occasionally blunt, and allergic to hype language. It doesn't beg for attention. It earns it.",
      personalityTraits: [
        "dry wit",
        "scene-rooted",
        "anti-hype",
        "honest",
        "understated",
        "occasionally sardonic",
      ],
      audienceNotes:
        "Local scene regulars, people who follow DIY labels, 25-38 age range. They spot fake immediately. They respect restraint. They do not want to be sold to.",
      postingGoals: [
        "Stay present without being annoying",
        "Build credibility through consistency not frequency",
        "Sound like an actual person wrote this",
        "Leave people wanting to show up in person",
      ],
      toneRules: [
        "Never beg. If someone doesn't come to the show, that's fine.",
        "No exclamation marks unless absolutely unavoidable.",
        "Do not explain the joke.",
        "Do not use the word 'journey'.",
        "Do not describe a show as 'epic' or 'unforgettable'.",
        "If it sounds like a band promoting itself, rewrite it.",
        "Dry is better than hype.",
        "Short is usually better than long.",
        "Write like you're texting the scene, not presenting to a board.",
      ],
      bannedPhrases: [
        "journey",
        "excited to announce",
        "honored",
        "we can't wait",
        "epic night",
        "don't miss out",
        "making memories",
        "limited tickets",
        "grab your tickets now",
        "unforgettable experience",
        "community",
        "passionate about",
        "proud to share",
        "game changer",
        "incredibly proud",
      ],
      bannedTopics: [
        "fake album chart claims",
        "streaming numbers unless real",
        "corporate partnerships",
        "brand deals",
      ],
      defaultTone: "AUTHENTIC",
      humorLevel: 6,
      edgeLevel: 7,
      emojiTolerance: 2,
      isExplicitOk: false,
      preferredLengths: ["SHORT", "MEDIUM"],
      instagramNotes:
        "One or two hashtags max. No emoji stacks. Caption reads first, hashtags feel like an afterthought.",
      blueskyNotes:
        "Treat this like a venue announcement on a corkboard. No fluff.",
      twitchNotes:
        "We don't usually stream but if we do, we're not performing — we're just playing.",
      goodExamples: [
        "Playing Burlington Bar Saturday. Nine-ish.",
        "We finished a record. It's called Nothing Stays. Out in February.",
        "Rehearsal went long. No one's complaining.",
      ],
      badExamples: [
        "We are SO EXCITED to announce our upcoming show — don't miss out on this unforgettable night!!!",
        "Honored to share that we've been working incredibly hard and are proud to reveal our new single!",
        "Tickets are moving fast — grab yours now before they're gone!!!",
      ],
    },
    update: {},
  });

  // Stalemate knowledge entries
  const stalemateKnowledge = [
    {
      type: "BAND_HISTORY" as const,
      title: "How Stalemate started",
      content:
        "Formed in 2019 when three people who'd been in other bands separately decided to stop waiting for the right lineup. Started playing basements. Eventually moved to bars. Never played a festival. Prefer it that way.",
      tags: ["origin", "diy"],
    },
    {
      type: "MEMBER_INFO" as const,
      title: "Current lineup",
      content:
        "Three members. Everyone sings. Roles have never been formally assigned. Everyone's played everything at some point.",
      tags: ["members"],
    },
    {
      type: "RUNNING_JOKE" as const,
      title: "The amp situation",
      content:
        "One amp has been borrowed since 2020 and nobody talks about it. This is fine to reference obliquely.",
      tags: ["gear", "inside-joke"],
    },
    {
      type: "SHOW_HISTORY" as const,
      title: "Burlington Bar residency",
      content:
        "Played Burlington Bar six times in 2023. It's the room they play best. The sound guy there is good. Mentioning this venue lands.",
      tags: ["venues", "chicago"],
    },
    {
      type: "AUDIENCE_NOTE" as const,
      title: "Core audience behavior",
      content:
        "A lot of the core audience finds out about shows through word of mouth. They tend to share posts without commenting. Don't mistake silence for indifference.",
      tags: ["audience", "engagement"],
    },
  ];

  for (const entry of stalemateKnowledge) {
    await prisma.knowledgeEntry.create({
      data: { bandId: stalemate.id, isActive: true, ...entry },
    });
  }

  // Stalemate platform accounts
  const stalematePlatforms = [
    { platform: "INSTAGRAM" as const, handle: "stalematechicago", profileUrl: "https://instagram.com/stalematechicago", isConnected: false },
    { platform: "BLUESKY" as const, handle: "stalemate.bsky.social", isConnected: false },
    { platform: "FACEBOOK" as const, handle: "stalemateband", isConnected: false },
    { platform: "YOUTUBE" as const, handle: "@stalematechicago", isConnected: false },
  ];

  const stalematePlatformAccounts: Awaited<ReturnType<typeof prisma.platformAccount.create>>[] = [];
  for (const p of stalematePlatforms) {
    const account = await prisma.platformAccount.upsert({
      where: { bandId_platform: { bandId: stalemate.id, platform: p.platform } },
      create: { bandId: stalemate.id, ...p, isActive: true },
      update: {},
    });
    stalematePlatformAccounts.push(account);
  }

  // ─── Band: Rad Dad ────────────────────────────────────────────────────────────
  const radDad = await prisma.band.upsert({
    where: { slug: "rad-dad" },
    create: {
      userId: user.id,
      name: "Rad Dad",
      slug: "rad-dad",
      description:
        "A high-energy cover band playing the pop punk, alternative rock, and early 2000s anthems that defined a generation. Full singalong policy. Shorts encouraged.",
      genre: "Pop Punk / Cover Band",
      location: "Chicago, IL",
      founded: "2021",
      coverColor: "#b91c1c",
    },
    update: {},
  });

  // Rad Dad voice profile
  await prisma.bandVoiceProfile.upsert({
    where: { bandId: radDad.id },
    create: {
      bandId: radDad.id,
      toneDescription:
        "Energetic, nostalgic, self-aware about being a cover band in the best way. Rad Dad knows exactly what it is and leans in hard. The voice is warm, crowd-focused, and always one step away from a mid-2000s reference. It's fun but not performatively quirky. It sounds like someone who genuinely loves these songs.",
      personalityTraits: [
        "nostalgic",
        "crowd-focused",
        "high-energy",
        "self-aware",
        "warm",
        "slightly chaotic",
      ],
      audienceNotes:
        "People who graduated between 2000 and 2012. They know every word. They want to sing. They bring their friends who don't know what the set list is but will by the end of the night.",
      postingGoals: [
        "Make people feel excited before they even get there",
        "Create FOMO among people who've been before",
        "Be shareable — people should want to tag friends",
        "Keep it fun without trying too hard",
      ],
      toneRules: [
        "It's okay to be enthusiastic — Rad Dad is allowed to have exclamation marks.",
        "Reference specific songs or albums when relevant. The audience knows them.",
        "Never sound corporate or formal.",
        "The singalong is always the point. Center it.",
        "Crowd first. Always.",
        "Abbreviations and informal language are fine.",
        "You can mention Mr. Brightside. Once. Per show.",
      ],
      bannedPhrases: [
        "critically acclaimed",
        "music journey",
        "authentic experience",
        "world-class",
        "industry",
        "monetize",
        "content creator",
        "leveraging",
        "synergy",
      ],
      bannedTopics: ["political opinions", "band drama", "gear talk nobody asked for"],
      defaultTone: "ENERGETIC",
      humorLevel: 8,
      edgeLevel: 3,
      emojiTolerance: 5,
      isExplicitOk: false,
      preferredLengths: ["SHORT", "MEDIUM"],
      instagramNotes:
        "Reels work. Story polls work. Caption should be fun and quick. 3-5 hashtags is fine.",
      facebookNotes:
        "A lot of the core audience is on Facebook still. Event posts get good reach. Tag the venue.",
      tiktokNotes:
        "Short clips of crowd singalongs are the format. Caption is secondary.",
      twitchNotes:
        "Streaming covers is a copyright minefield. Avoid unless for a practice session.",
      goodExamples: [
        "Playing Lincoln Hall this Saturday. We will 100% play Mr. Brightside. Come fight us.",
        "Hey Chicago. Friday night. Full pop punk set. Bring your friends who 'don't really like live music'.",
        "Band practice: we spent 40 minutes arguing about the tempo of Basket Case. Worth it.",
      ],
      badExamples: [
        "We are incredibly honored to announce our upcoming performance and can't wait to share this incredible experience with all of you!",
        "Our music journey continues as we bring our critically acclaimed set to a new stage!",
      ],
    },
    update: {},
  });

  // Rad Dad knowledge entries
  const radDadKnowledge = [
    {
      type: "BAND_HISTORY" as const,
      title: "Rad Dad origin",
      content:
        "Started as a one-off party set in 2021. The crowd reaction was too good to walk away from. Became a regular thing within three months. Never intended to be permanent. Here we are.",
      tags: ["origin"],
    },
    {
      type: "RUNNING_JOKE" as const,
      title: "Mr. Brightside",
      content:
        "They always play Mr. Brightside. This is a known thing. Audiences expect it. It always goes off. Feel free to reference this in posts — the audience knows.",
      tags: ["setlist", "inside-joke"],
    },
    {
      type: "RUNNING_JOKE" as const,
      title: "The shorts policy",
      content:
        "Shorts are encouraged at every show. This started as a joke in a post and stuck. It's part of the identity now.",
      tags: ["crowd", "inside-joke"],
    },
    {
      type: "AUDIENCE_NOTE" as const,
      title: "Audience engagement style",
      content:
        "This audience WANTS to be engaged. They'll take the mic if you let them. Polls, questions, requests — all of it works. They are enthusiastic participants, not passive observers.",
      tags: ["audience", "engagement"],
    },
    {
      type: "SHOW_HISTORY" as const,
      title: "Best rooms",
      content:
        "Lincoln Hall and Subterranean are the best rooms. Both have good sound and an audience that's already in the right headspace.",
      tags: ["venues", "chicago"],
    },
  ];

  for (const entry of radDadKnowledge) {
    await prisma.knowledgeEntry.create({
      data: { bandId: radDad.id, isActive: true, ...entry },
    });
  }

  // Rad Dad platform accounts
  const radDadPlatforms = [
    { platform: "INSTAGRAM" as const, handle: "raddadband", isConnected: false },
    { platform: "FACEBOOK" as const, handle: "raddadbandchicago", isConnected: false },
    { platform: "TIKTOK" as const, handle: "@raddadband", isConnected: false },
    { platform: "YOUTUBE" as const, handle: "@raddadband", isConnected: false },
  ];

  const radDadPlatformAccounts: Awaited<ReturnType<typeof prisma.platformAccount.create>>[] = [];
  for (const p of radDadPlatforms) {
    const account = await prisma.platformAccount.upsert({
      where: { bandId_platform: { bandId: radDad.id, platform: p.platform } },
      create: { bandId: radDad.id, ...p, isActive: true },
      update: {},
    });
    radDadPlatformAccounts.push(account);
  }

  // ─── Events ──────────────────────────────────────────────────────────────────
  const stalemateShow = await prisma.event.create({
    data: {
      bandId: stalemate.id,
      title: "Stalemate at Burlington Bar",
      venue: "Burlington Bar",
      city: "Chicago",
      state: "IL",
      eventDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      doorsTime: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000),
      ticketUrl: "https://example.com/stalemate-burlington",
      isHeadlining: true,
      notes: "First show back since the spring. Playing most of the new stuff.",
    },
  });

  const radDadShow = await prisma.event.create({
    data: {
      bandId: radDad.id,
      title: "Rad Dad at Lincoln Hall",
      venue: "Lincoln Hall",
      city: "Chicago",
      state: "IL",
      eventDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
      doorsTime: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000 - 90 * 60 * 1000),
      ticketUrl: "https://example.com/raddad-lincoln",
      isHeadlining: true,
      notes: "Full two-hour set. Singalong section mid-set. We'll play Mr. Brightside. We always do.",
    },
  });

  // ─── Campaigns ───────────────────────────────────────────────────────────────
  const stalemateCampaign = await prisma.campaign.create({
    data: {
      bandId: stalemate.id,
      eventId: stalemateShow.id,
      type: "SHOW_ANNOUNCEMENT",
      name: "Burlington Bar — May Show",
      description: "Announcing and promoting the Burlington Bar show across platforms.",
      targetDate: stalemateShow.eventDate,
    },
  });

  const radDadCampaign = await prisma.campaign.create({
    data: {
      bandId: radDad.id,
      eventId: radDadShow.id,
      type: "SHOW_ANNOUNCEMENT",
      name: "Lincoln Hall — Pop Punk Night",
      description: "Full campaign for Lincoln Hall show. Announcement through day-of.",
      targetDate: radDadShow.eventDate,
    },
  });

  // ─── Drafts ──────────────────────────────────────────────────────────────────

  // Stalemate drafts (IN_REVIEW)
  const stalemateDrafts = [
    {
      platform: "INSTAGRAM" as const,
      status: "IN_REVIEW" as const,
      toneVariant: "AUTHENTIC" as const,
      contentLength: "SHORT" as const,
      caption: "Burlington Bar. Two weeks.",
      hashtags: ["#chicago", "#livemusic"],
      brandFitScore: 94,
      confidenceNotes: "High brand fit. Stalemate's core voice. No fluff.",
      riskLevel: "LOW" as const,
      riskFlags: [],
    },
    {
      platform: "BLUESKY" as const,
      status: "IN_REVIEW" as const,
      toneVariant: "DIRECT" as const,
      contentLength: "MEDIUM" as const,
      caption:
        "Playing Burlington Bar on the 14th. Doors at 8. We'll be done by 10:30. Come if you can.",
      hashtags: ["#chicago", "#indierock"],
      brandFitScore: 91,
      confidenceNotes: "Very on-brand. Bluesky audience will respond to the directness.",
      riskLevel: "LOW" as const,
      riskFlags: [],
    },
    {
      platform: "INSTAGRAM" as const,
      status: "APPROVED" as const,
      toneVariant: "AUTHENTIC" as const,
      contentLength: "SHORT" as const,
      caption: "Three weeks since the last practice. We fixed it.",
      hashtags: ["#rehearsal"],
      brandFitScore: 88,
      confidenceNotes: "Strong voice match. Good standalone post.",
      riskLevel: "LOW" as const,
      riskFlags: [],
      reviewedAt: new Date(),
    },
    {
      platform: "FACEBOOK" as const,
      status: "IN_REVIEW" as const,
      toneVariant: "DIRECT" as const,
      contentLength: "MEDIUM" as const,
      caption:
        "We're at Burlington Bar in two weeks. Playing the new stuff for the first time. If you've been around since 2020 you'll recognize two of the three songs we're debuting.\n\nTickets: https://example.com/stalemate-burlington",
      hashtags: ["#chicago", "#originalmusic", "#livemusic"],
      brandFitScore: 86,
      confidenceNotes: "Good length for Facebook. Authentic voice throughout.",
      riskLevel: "LOW" as const,
      riskFlags: [],
    },
  ];

  for (const draft of stalemateDrafts) {
    const d = await prisma.draft.create({
      data: {
        bandId: stalemate.id,
        campaignId: stalemateCampaign.id,
        ...draft,
        fanReplies: [],
        currentVersion: 1,
      },
    });
    await prisma.draftVersion.create({
      data: {
        draftId: d.id,
        version: 1,
        caption: draft.caption,
        hashtags: draft.hashtags,
        changeNotes: "Initial generation",
      },
    });
  }

  // Rad Dad drafts (IN_REVIEW)
  const radDadDrafts = [
    {
      platform: "INSTAGRAM" as const,
      status: "IN_REVIEW" as const,
      toneVariant: "ENERGETIC" as const,
      contentLength: "SHORT" as const,
      caption:
        "Lincoln Hall. Three weeks. We're playing Basket Case, Misery Business, and at least twelve other songs you know all the words to.",
      hashtags: ["#covermusicband", "#chicago", "#popunk", "#singalong"],
      ctaText: "Tickets in bio",
      brandFitScore: 92,
      confidenceNotes: "Perfectly on-brand. Specific song references are exactly right for Rad Dad.",
      riskLevel: "LOW" as const,
      riskFlags: [],
    },
    {
      platform: "FACEBOOK" as const,
      status: "IN_REVIEW" as const,
      toneVariant: "NOSTALGIC" as const,
      contentLength: "MEDIUM" as const,
      caption:
        "Hey Chicago.\n\nLincoln Hall. Three weeks from Saturday. Two hours of pop punk and alternative covers you've been waiting to scream.\n\nWe will play Mr. Brightside. We always do.\n\nBring the people from your group chat who claim they don't like live music.",
      hashtags: ["#chicago", "#raddad", "#covermusicband", "#lincolnhall"],
      brandFitScore: 95,
      confidenceNotes: "Excellent. Hits every Rad Dad note. The Mr. Brightside line is their signature.",
      riskLevel: "LOW" as const,
      riskFlags: [],
    },
    {
      platform: "TIKTOK" as const,
      status: "IN_REVIEW" as const,
      toneVariant: "FUNNY" as const,
      contentLength: "SHORT" as const,
      caption:
        "POV: You agreed to go to \"just one show\" with your friend who's been going to Rad Dad since 2021. Lincoln Hall. Three weeks.",
      hashtags: ["#raddadband", "#coverband", "#popunk", "#chicago", "#livemusicchicago"],
      brandFitScore: 88,
      confidenceNotes: "TikTok-native format. POV framing works for this audience.",
      riskLevel: "LOW" as const,
      riskFlags: [],
    },
    {
      platform: "INSTAGRAM" as const,
      status: "APPROVED" as const,
      toneVariant: "FUNNY" as const,
      contentLength: "SHORT" as const,
      caption:
        "Band practice. We played Basket Case eight times in a row. Nobody stopped us.",
      hashtags: ["#rehearsal", "#covermusicband"],
      brandFitScore: 90,
      confidenceNotes: "Great casual post. Very Rad Dad.",
      riskLevel: "LOW" as const,
      riskFlags: [],
      reviewedAt: new Date(),
    },
  ];

  for (const draft of radDadDrafts) {
    const d = await prisma.draft.create({
      data: {
        bandId: radDad.id,
        campaignId: radDadCampaign.id,
        ...draft,
        fanReplies: [],
        currentVersion: 1,
      },
    });
    await prisma.draftVersion.create({
      data: {
        draftId: d.id,
        version: 1,
        caption: draft.caption,
        hashtags: draft.hashtags,
        changeNotes: "Initial generation",
      },
    });
  }

  // ─── Published Posts ──────────────────────────────────────────────────────────
  const stalemateInstagram = stalematePlatformAccounts.find((a) => a.platform === "INSTAGRAM")!;
  const radDadInstagram = radDadPlatformAccounts.find((a) => a.platform === "INSTAGRAM")!;
  const radDadFacebook = radDadPlatformAccounts.find((a) => a.platform === "FACEBOOK")!;

  const publishedPosts = [
    {
      bandId: stalemate.id,
      platformAccountId: stalemateInstagram.id,
      platform: "INSTAGRAM" as const,
      caption: "Burlington Bar was a good room last night. Thank you for showing up.",
      hashtags: ["#chicago", "#livemusic"],
      publishedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      impressions: 412,
      reach: 380,
      likes: 67,
      comments: 8,
      shares: 4,
    },
    {
      bandId: stalemate.id,
      platformAccountId: stalemateInstagram.id,
      platform: "INSTAGRAM" as const,
      caption: "New song is almost finished. Needs one more day.",
      hashtags: [],
      publishedAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
      impressions: 298,
      reach: 270,
      likes: 44,
      comments: 3,
      shares: 2,
    },
    {
      bandId: radDad.id,
      platformAccountId: radDadInstagram.id,
      platform: "INSTAGRAM" as const,
      caption:
        "Last Saturday at Subterranean was one for the books. You all knew every single word. Every one.",
      hashtags: ["#raddad", "#chicago", "#coverband"],
      publishedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      impressions: 2840,
      reach: 2600,
      likes: 312,
      comments: 47,
      shares: 38,
    },
    {
      bandId: radDad.id,
      platformAccountId: radDadFacebook.id,
      platform: "FACEBOOK" as const,
      caption:
        "For everyone who asked if we'd be doing another full pop punk night — yes. Lincoln Hall. Three weeks. More details coming.",
      hashtags: [],
      publishedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      impressions: 1560,
      reach: 1400,
      likes: 98,
      comments: 31,
      shares: 21,
    },
  ];

  for (const post of publishedPosts) {
    await prisma.publishedPost.create({ data: post });
  }

  // ─── Analytics Snapshots ─────────────────────────────────────────────────────
  const analyticsData = [
    // Stalemate
    {
      bandId: stalemate.id,
      platform: "INSTAGRAM" as const,
      campaignType: "RECAP" as const,
      toneVariant: "AUTHENTIC" as const,
      contentLength: "SHORT" as const,
      postedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      dayOfWeek: 0,
      hourOfDay: 20,
      impressions: 412,
      reach: 380,
      likes: 67,
      comments: 8,
      shares: 4,
      engagementRate: 0.208,
    },
    {
      bandId: stalemate.id,
      platform: "INSTAGRAM" as const,
      campaignType: "REHEARSAL" as const,
      toneVariant: "AUTHENTIC" as const,
      contentLength: "SHORT" as const,
      postedAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
      dayOfWeek: 3,
      hourOfDay: 14,
      impressions: 298,
      reach: 270,
      likes: 44,
      comments: 3,
      shares: 2,
      engagementRate: 0.181,
    },
    // Rad Dad — better engagement overall
    {
      bandId: radDad.id,
      platform: "INSTAGRAM" as const,
      campaignType: "RECAP" as const,
      toneVariant: "GRATEFUL" as const,
      contentLength: "SHORT" as const,
      postedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      dayOfWeek: 0,
      hourOfDay: 19,
      impressions: 2840,
      reach: 2600,
      likes: 312,
      comments: 47,
      shares: 38,
      engagementRate: 0.152,
    },
    {
      bandId: radDad.id,
      platform: "FACEBOOK" as const,
      campaignType: "SHOW_ANNOUNCEMENT" as const,
      toneVariant: "NOSTALGIC" as const,
      contentLength: "MEDIUM" as const,
      postedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      dayOfWeek: 2,
      hourOfDay: 18,
      impressions: 1560,
      reach: 1400,
      likes: 98,
      comments: 31,
      shares: 21,
      engagementRate: 0.096,
    },
    {
      bandId: radDad.id,
      platform: "INSTAGRAM" as const,
      campaignType: "SHOW_ANNOUNCEMENT" as const,
      toneVariant: "ENERGETIC" as const,
      contentLength: "SHORT" as const,
      postedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      dayOfWeek: 5,
      hourOfDay: 17,
      impressions: 1920,
      reach: 1700,
      likes: 187,
      comments: 28,
      shares: 19,
      engagementRate: 0.124,
    },
  ];

  for (const snap of analyticsData) {
    await prisma.analyticsSnapshot.create({ data: snap });
  }

  // ─── Livestream Event ─────────────────────────────────────────────────────────
  const radDadStream = await prisma.livestreamEvent.create({
    data: {
      bandId: radDad.id,
      title: "Rad Dad Live: Practice Session",
      subtitle: "Testing the stream setup before Lincoln Hall",
      description:
        "Running through the set before the Lincoln Hall show. Streaming live so you can give us notes. Or just watch us fall apart and put it back together.",
      scheduledFor: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      pinnedComment:
        "📌 Tickets for Lincoln Hall in 3 weeks: https://example.com/raddad-lincoln — we'll play Mr. Brightside tonight too",
      ctaText: "Grab Lincoln Hall tickets while you watch",
      guestNotes: "No guests. Just the band.",
      sceneNotes:
        "Practice space. Messy. Keep the camera mostly on the performers, not the ceiling cables.",
      gearChecklist: [
        "Stream key active",
        "Audio interface connected",
        "Check OBS scene transitions",
        "Backup internet ready",
        "Camera angle locked before going live",
        "Set list printed",
        "Water bottles",
      ],
      obsNotes:
        "Scene: Band. Scene 2: Song title lower-third. Scene 3: just audio for breaks. Transition: cut.",
      clipIdeas: [
        "The moment someone nails the high note in Misery Business",
        "Mr. Brightside singalong — always clips well",
        "Any moment the crowd chat goes crazy",
        "Funny tuning moment if one happens",
      ],
      highlightIdeas: [
        "Full Basket Case",
        "Mr. Brightside + crowd reaction montage",
        "Best singalong moment compilation",
      ],
    },
  });

  // Run of show
  const rosItems = [
    {
      order: 0,
      title: "Pre-show setup and hello",
      duration: 5,
      notes: "Get the chat going. Say hi. Check levels.",
      banterPrompts: [
        "Ask where people are watching from",
        "Tell them what tonight's about without over-explaining",
        "Mention the Lincoln Hall show once — not twice",
      ],
      engagementPrompts: [
        "Drop your most-requested song below",
        "What city are you in?",
        "Who's been to a Rad Dad show before?",
      ],
    },
    {
      order: 1,
      title: "First 4 songs",
      duration: 20,
      notes:
        "Hit the energy fast. No slow openers. Start with something they already know.",
      banterPrompts: [
        "Quick intro between songs, nothing long",
        "Acknowledge the chat when they lose their minds",
      ],
      engagementPrompts: [
        "Guess the next song before we play it",
        "Rate the last one out of 10",
      ],
    },
    {
      order: 2,
      title: "Mid-set chat break",
      duration: 5,
      notes: "Take a breath. Answer a few chat questions. Mention the show.",
      banterPrompts: [
        "Read a couple comments out loud — pick good ones",
        "Mention something that happened at the last show",
        "Keep it under 5 minutes",
      ],
      engagementPrompts: [
        "Ask for final set list requests",
        "Poll: slow song or fast one next?",
      ],
    },
    {
      order: 3,
      title: "Main set continuation",
      duration: 25,
      notes: "Whatever was requested + essentials. This is the bulk.",
      banterPrompts: [
        "Tell a quick story about one of the songs",
        "Keep transitions short — this is a practice stream, not a performance",
      ],
      engagementPrompts: [
        "Name the song before we play the intro",
        "What year did this song come out",
      ],
    },
    {
      order: 4,
      title: "Mr. Brightside + outro",
      duration: 10,
      notes:
        "End on Mr. Brightside. It always works. Say goodbye. Remind about Lincoln Hall.",
      banterPrompts: [
        "Intro the song like you're at a real show — build it up",
        "After: thank everyone, plug the real show, keep it short",
      ],
      engagementPrompts: [
        "Sing it in the chat right now",
        "How many of you are coming to Lincoln Hall",
      ],
    },
  ];

  for (const item of rosItems) {
    await prisma.livestreamRunOfShowItem.create({
      data: { livestreamEventId: radDadStream.id, ...item },
    });
  }

  // Livestream destinations
  await prisma.livestreamDestination.createMany({
    data: [
      {
        livestreamEventId: radDadStream.id,
        platform: "YOUTUBE",
        streamTitle: "Rad Dad Practice Session — Lincoln Hall preview",
        rtmpUrl: "rtmp://a.rtmp.youtube.com/live2",
        streamKey: "[stored-server-side]",
        isEnabled: true,
      },
      {
        livestreamEventId: radDadStream.id,
        platform: "FACEBOOK",
        streamTitle: "Rad Dad Live Practice",
        isEnabled: true,
      },
    ],
  });

  console.log("Seed complete.");
  console.log(`  Bands: Stalemate (${stalemate.id}), Rad Dad (${radDad.id})`);
  console.log(`  Events: ${stalemateShow.id}, ${radDadShow.id}`);
  console.log(`  Campaigns: ${stalemateCampaign.id}, ${radDadCampaign.id}`);
  console.log(`  Livestream: ${radDadStream.id}`);
  console.log(`  Analytics snapshots: ${analyticsData.length}`);
  console.log(`  Published posts: ${publishedPosts.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
