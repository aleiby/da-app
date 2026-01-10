# Gaming Ad Network Research

Research completed January 2026 for Digital Arcana monetization strategy.

## Executive Summary

This document evaluates gaming-specific ad networks for monetizing Digital Arcana, a browser-based card game using Unity WebGL. The goal is self-sustaining revenue to cover hosting costs while remaining free-to-play.

**Key Finding**: Google Ads rejected the original "ads on card artwork" concept. Gaming-specific ad networks offer better compatibility with browser games and support ad formats designed for gaming contexts.

**Initial Recommendation**: AppLixir for rewarded video ads, paired with AdinPlay/Venatus for display/interstitial ads. Both specialize in HTML5/WebGL browser games and have no minimum traffic requirements.

**Status**: This recommendation is **not acceptable** for Digital Arcana. Interstitial ads and rewarded videos are intrusive and not aligned with the project's vision. The preferred approach is displaying ads directly on the default card artwork - this is less intrusive, provides constant exposure, and naturally incentivizes purchasing NFT card packs to remove ads.

**Next Steps**: Research custom "ads-on-cards" integration with these gaming ad networks. See issue **da-app-crq** for follow-up work.

---

## Evaluated Ad Networks

### 1. AdinPlay (Acquired by Venatus)

**Overview**: Self-described "Number One Ad Platform for HTML5 Game Publishers" with over a decade of browser game monetization experience. Acquired by Venatus in 2023.

**Ad Formats Supported**:
- Rewarded videos
- Interstitial ads
- Display banners with header-bidding
- Branded site skins and takeovers

**Key Partners**: Paper.io, Gartic Phone, Skribbl.io (major .io games)

**Revenue Potential**:
- Direct campaigns can see up to 10x greater RPMs compared to standard RTB
- Publishers can add 30% greater revenue by adding direct demand
- Access to premium advertisers: LEGO, Xbox, PepsiCo

**Requirements**:
- No stated minimum traffic threshold
- Gaming/entertainment content focus
- Contact via website form

**Integration**: Optimized HTML5 ad solutions with server and client-side header bidding

**Website**: https://adinplay.com/

---

### 2. Venatus

**Overview**: Global AdTech platform specializing in gaming and entertainment. Parent company of AdinPlay since 2023.

**Key Partners**: EA, Rovio, Scopely, Miniclip, Op.gg, Futbin

**Ad Formats**:
- Display banners
- Video ads
- Native ads
- High-impact formats with 80% viewability rate

**Requirements**:
- Approval typically takes 10-14 business days
- Gaming publishers eligible (review sites, web-based games, companion sites)
- Free to join, revenue-share model
- No stated minimum traffic threshold

**Platform**: "Prosper" - purpose-built publisher platform connecting to top SSPs and global brands

**Website**: https://www.venatus.com/

---

### 3. MonetizeMore

**Overview**: Ad operations partner offering header bidding, Google AdX access, and advanced optimization. Works with HTML5 and web-based games.

**Key Features**:
- PubGuru Header Bidding technology for highest RPMs
- Supports non-SDK environments (important for WebGL)
- Rewarded video platform for WordPress, H5, iOS, Android games

**Ad Formats**:
- Display ads
- Native ads
- Video ads (including rewarded)
- Interactive ad units

**Requirements**:
- Eligibility: Sites earning at least $1,000/month in ad revenue
- Higher barrier than other options for new projects

**Best For**: Established games with proven traffic

**Website**: https://www.monetizemore.com/

---

### 4. AppLixir (RECOMMENDED for Rewarded Ads)

**Overview**: Video ad monetization platform specifically built for web-based and HTML5 games. Pioneer in web-based game monetization since 2016.

**Specialization**: Rewarded video ads only (opt-in, non-intrusive)

**Key Features**:
- Lightweight JavaScript SDK or Unity WebGL plugin
- Full support for async ad loading, event callbacks, reward confirmation
- Cross-browser compatible without plugins
- No player login/account required
- Low payout threshold: $50 via PayPal or direct deposit

**eCPM Performance**: $15-$25 for US traffic (gaming audiences)

**Requirements**:
- No minimum traffic requirements
- Single line of JavaScript code integration
- Unity WebGL supported natively

**Best For**: Digital Arcana's Unity WebGL architecture and free-to-play model

**Website**: https://www.applixir.com/

---

### 5. GameDistribution (Azerion)

**Overview**: Europe's largest video games distributor with 20,000+ titles. Provides both distribution and monetization.

**Key Features**:
- HeaderLift ad technology for real-time optimization
- Pre-roll, mid-roll, and rewarded ads
- Revenue sharing with developers
- Distribution to 4,800+ portals and media companies

**Ad Formats**:
- Pre-roll video
- Mid-roll video
- Rewarded video
- Interstitials

**Best For**: Games seeking distribution AND monetization (may be overkill for self-hosted project)

**Website**: https://gamedistribution.com/

---

### 6. Google AdSense / H5 Games Ads

**Overview**: Google's standard ad platform with limited HTML5 game support (currently in closed beta).

**Ad Formats**:
- Display ads
- TrueView video
- Bumper video ads
- Interstitials (limited)
- Rewarded ads (limited)

**Limitations**:
- H5 Games Ads in closed beta
- Only AdSense ad resources (not full AdX)
- Already rejected "ads on card artwork" concept

**Requirements**: No minimum traffic, but strict content policies

**Recommendation**: NOT recommended as primary solution due to previous rejection and gaming limitations

---

## Integration Points for Digital Arcana

### Current Architecture
- Frontend: React + TypeScript with Unity WebGL for 3D card table
- Backend: Express + Socket.io
- Communication: Unity bridge (UnityContext.send/on pattern)

### Recommended Ad Placements

#### 1. Pre-Game/Post-Game Interstitials
- **When**: Before entering a game or after a game ends
- **Format**: Full-screen interstitial (15-30 seconds, skippable)
- **Networks**: AdinPlay, Venatus
- **Implementation**: Trigger via Unity bridge before/after game state changes

#### 2. Rewarded Video Ads (PRIORITY)
- **When**: Player choice moments (extra lives, bonus cards, retry after loss)
- **Format**: Opt-in 15-30 second video with reward confirmation
- **Networks**: AppLixir (primary), AdinPlay (secondary)
- **Implementation**:
  ```javascript
  // AppLixir integration via Unity WebGL plugin
  // Reward confirmation via callback
  unityContext.on("RequestRewardedAd", async () => {
    // Show AppLixir rewarded ad
    // On completion: unityContext.send(gameManager, "OnRewardGranted", rewardValue);
  });
  ```

#### 3. Banner Ads Around Game Canvas
- **When**: Persistent during gameplay
- **Format**: Standard IAB sizes (728x90 leaderboard, 300x250 rectangle)
- **Networks**: AdinPlay, Venatus, Google AdSense
- **Implementation**: React components outside Unity canvas
- **Caution**: May impact performance on lower-end devices

#### 4. Card Artwork Ads (PREFERRED - Original Concept)
- **Status**: Rejected by Google Ads, but gaming-specific networks may be more flexible
- **Why Preferred**: Less intrusive, constant exposure, incentivizes NFT card pack purchases to remove ads
- **Networks to Explore**: AppLixir, AdinPlay, Venatus - need to inquire about custom ad placements
- **Questions**: Can ads render to canvas/texture? API access for programmatic fetching? Impression tracking?
- **Follow-up**: See issue **da-app-crq** for research tasks

---

## Revenue Estimates

Based on industry benchmarks for browser games (2025 data):

| Traffic Level | Monthly eCPM Range | Est. Monthly Revenue |
|--------------|-------------------|---------------------|
| 10K sessions | $5-15 | $50-150 |
| 50K sessions | $8-20 | $400-1,000 |
| 100K sessions | $10-25 | $1,000-2,500 |

**Rewarded Video Premium**: Rewarded ads typically yield 2-3x higher eCPM than standard display.

**US Traffic Premium**: eCPMs for US audiences are 3-5x higher than global average.

---

## Implementation Roadmap

### Phase 1: Quick Win (Week 1-2)
1. Integrate AppLixir rewarded video ads
2. Add "Watch Ad for Bonus" feature for default deck players
3. Test ad loading and reward confirmation flow

### Phase 2: Display Monetization (Week 3-4)
1. Apply to AdinPlay/Venatus
2. Add banner ad placements around game canvas
3. Implement pre-game/post-game interstitials

### Phase 3: Optimization (Ongoing)
1. A/B test ad placements and frequencies
2. Monitor eCPM and fill rates
3. Consider ad mediation for best yields

---

## Free-to-Play Model Integration

### Ad Strategy for Default Deck Users
Players using the free default deck see ads to support hosting costs:
- Rewarded ads for optional bonuses (extra shuffles, hints, etc.)
- Interstitials between games (capped frequency)
- Banner ads during gameplay

### Premium NFT Deck Owners
Players who purchase NFT card packs:
- **Option A**: Ad-free experience (premium benefit)
- **Option B**: Reduced ads with opt-in rewarded ads for bonuses
- **Option C**: Same ad experience (simplest implementation)

Recommended: **Option A** - Ad-free for NFT owners incentivizes purchases.

---

## Traffic Requirements Summary

| Network | Min Traffic | Min Revenue | Notes |
|---------|-------------|-------------|-------|
| AppLixir | None | $50 payout | Best for starting out |
| AdinPlay | None stated | Revenue share | Gaming specialist |
| Venatus | None stated | Revenue share | 10-14 day approval |
| Google AdSense | None | $100 payout | H5 ads in beta |
| MonetizeMore | None | $1,000/mo | Higher barrier |

---

## Next Steps

1. **Priority**: Research ads-on-cards feasibility with gaming ad networks (see **da-app-crq**)
   - Contact AppLixir, AdinPlay, Venatus about custom ad placements
   - Ask about rendering ads to canvas/WebGL textures
   - Understand impression tracking for embedded ads
2. **Fallback**: If ads-on-cards not feasible, reconsider standard formats
3. **Development**: Create ad integration points in Unity bridge
4. **Testing**: Implement test ads before production deployment

---

## Sources

- [AdinPlay Publishers](https://adinplay.com/publishers)
- [Venatus Browser Game Monetization](https://www.venatus.com/publishers/browser-game-monetization)
- [MonetizeMore Gaming Ad Networks](https://www.monetizemore.com/blog/top-ad-networks-gaming-vertical/)
- [AppLixir Unity WebGL Monetization](https://www.applixir.com/blog/unity-webgl-monetization-in-3-easy-steps/)
- [DoonDook Studio Best Ad Networks for HTML5 Games](https://doondook.studio/best-ad-networks-monetize-html5-games/)
- [GameDistribution Blog](https://blog.gamedistribution.com/game-monetization-strategies/)
