# Hosting Options Evaluation

Research completed January 2026 for Digital Arcana deployment infrastructure.

## Executive Summary

This document evaluates cost-effective hosting options for Digital Arcana, a multiplayer card game requiring real-time WebSocket connections, Redis for game state, and MongoDB for inventory.

**Key Requirements**:
- Express + Socket.io server (persistent WebSocket connections)
- Redis for real-time game state
- MongoDB for card pack inventory (currently using Atlas)
- HTTPS for Tezos wallet integrations
- Cost must be covered by ad revenue (see da-app-0yl)

**Recommendation**: **Railway** for initial deployment, with migration path to **Fly.io** if global latency becomes important.

| Criteria | Railway | Render | Fly.io |
|----------|---------|--------|--------|
| Ease of Setup | Excellent | Good | Moderate |
| WebSocket Support | Native | Native | Native |
| Built-in Redis | Yes | Yes | Yes (Upstash) |
| Free Tier | $5 trial only | Limited free | Pay-as-you-go |
| Estimated Monthly | $5-15 | $7-20 | $5-20 |
| Global Edge | No | No | Yes (20+ regions) |

---

## Platform Evaluations

### 1. Railway (RECOMMENDED)

**Overview**: Modern PaaS optimized for developer experience. Supports almost anything including Node.js, Docker, PostgreSQL, MySQL, MongoDB, and Redis with one-click setup.

**Pricing Model**:
- Usage-based: Pay for RAM hours, CPU hours, and storage
- Hobby Plan: $5/month included credits (most hobby projects stay under this)
- Pro Plan: $20/month included credits
- No permanent free tier (free tier is 30-day trial only)

**Key Features**:
- HTTP, TCP, gRPC, and WebSockets handled automatically
- One-click Redis and PostgreSQL setup (included in usage credits)
- Up to 100 GBPS private networking, 10 GBPS public traffic
- GitHub integration with automatic deploys
- No Dockerfiles required (though supported)

**Why Railway for Digital Arcana**:
1. **Simplicity**: Connect GitHub, Railway auto-detects Node.js and deploys
2. **All-in-one**: Server + Redis in same project, no external services needed
3. **WebSocket native**: Socket.io works without configuration
4. **Cost-efficient**: Most customers save ~40% vs other platforms
5. **Flexible scaling**: Pay only for actual usage, good for variable traffic

**Estimated Monthly Cost**:
- Low traffic (prototype): $5-8
- Moderate traffic (100+ DAU): $10-15
- Higher traffic: Scales with usage

**Limitations**:
- No global edge deployment (single region)
- No permanent free tier

**Sources**:
- [Railway Pricing](https://railway.com/pricing)
- [Railway Docs - Plans](https://docs.railway.com/reference/pricing/plans)

---

### 2. Render

**Overview**: Full-stack PaaS for static sites, Node.js web services, background workers, and cron jobs. Positioned as Heroku alternative.

**Pricing Model**:
- Free tier: 750 hours compute, 1 GB PostgreSQL, 100 GB bandwidth (no credit card required)
- Starter: $7/month for enhanced resources (0.5 CPU, 512MB RAM)
- Professional: $19/user/month + compute usage
- Pay-as-you-go for variable traffic

**Key Features**:
- Managed PostgreSQL and Redis-like services
- Private networking between services
- Automatic SSL
- Continuous deployment from GitHub/GitLab
- Persistent storage and stateful connections (WebSockets) supported

**Why Render for Digital Arcana**:
1. **Free tier exists**: Can test and develop without initial cost
2. **Easy setup**: Users report extremely easy deployment for Express + Redis
3. **WebSocket support**: Persistent connections work natively
4. **Clean dashboard**: Intuitive management interface

**Estimated Monthly Cost**:
- Free tier testing: $0 (with limitations)
- Low traffic production: $7-14 (Starter tier + Redis)
- Moderate traffic: $15-25

**Limitations**:
- Bandwidth limits on free tier (charges for exceeding)
- Free tier services spin down after inactivity (cold starts)
- No global edge deployment

**Sources**:
- [Render Pricing](https://render.com/pricing)
- [Render Free Tier Limits](https://www.freetiers.com/directory/render)

---

### 3. Fly.io

**Overview**: Developer-centric platform with innovative edge deployment model. Apps deploy across 20+ global regions for optimal latency.

**Pricing Model**:
- Pay-as-you-go: Per-second compute, per-hour storage, bandwidth per region
- Redis: Upstash extension with pay-as-you-go pricing
- Small database: $2-5/month
- High-availability setups: $80+/month

**Key Features**:
- Global deployment across 20+ regions (lower latency than US-only platforms)
- Native WebSocket support
- Built-in Upstash Redis integration
- PostgreSQL hosting
- Granular usage-based pricing

**Why Fly.io for Digital Arcana**:
1. **Global latency**: If players are worldwide, edge deployment matters
2. **WebSocket performance**: Better for real-time multiplayer at scale
3. **Pay-as-you-go Redis**: Only pay for what you use

**Estimated Monthly Cost**:
- Low traffic: $5-10
- Moderate traffic: $15-25
- Note: Costs can spike if services aren't tightly managed

**Limitations**:
- Dedicated IPv4: $2/month per app (can add up with multiple services)
- Volumes billed hourly even when machines idle
- Volume snapshot storage charges starting January 2026
- More complex setup than Railway/Render
- 40% discount available with compute time reservation

**Sources**:
- [Fly.io Pricing](https://fly.io/pricing/)
- [Fly.io Cost Management](https://fly.io/docs/about/cost-management/)
- [Fly.io Pricing Calculator](https://fly.io/calculator)

---

## Split Architecture Option

**Concept**: Host static React frontend on Netlify/Vercel (free, excellent CDN), separate backend on Railway/Render/Fly.io.

**Why NOT Recommended for Digital Arcana**:

1. **WebSocket Limitation**: Vercel/Netlify do not support WebSocket servers
   - Vercel explicitly states: "Serverless Functions do not support WebSockets"
   - Socket.io requires persistent connections that serverless can't maintain

2. **Added Complexity**: Managing two hosting platforms vs one
   - CORS configuration
   - Separate deployment pipelines
   - Two potential failure points

3. **Current Architecture**: Express server serves both Socket.io and React build in production
   - Splitting requires architectural changes
   - Single deployment is simpler for a community project

4. **Cost Savings Minimal**: Backend hosting is the main cost anyway
   - Frontend-only hosting doesn't significantly reduce expenses

**When Split WOULD Make Sense**:
- Very high static asset traffic (CDN benefits outweigh complexity)
- Team prefers JAMstack architecture
- Future plans to separate frontend into SPA with API backend

**Sources**:
- [Vercel WebSocket Limitations](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections)
- [Netlify Socket.io Support](https://answers.netlify.com/t/socket-io-hosting/87330)

---

## Redis Options

### Option A: Platform-Managed (Recommended)
Railway and Render both offer one-click Redis that runs alongside the application:
- Included in usage-based pricing
- Private networking (fast, secure)
- Simple setup, no external accounts

### Option B: Upstash (For Fly.io or Independent)
- Serverless Redis with pay-per-request pricing
- $0.2 per 100K requests (first 10K free daily)
- Good for Fly.io integration
- Multi-region replication available

### Option C: Redis Cloud
- Dedicated Redis hosting
- Starting at $5/month for 250MB
- More features but separate service to manage

**Recommendation**: Use platform-managed Redis (Railway or Render) for simplicity.

---

## MongoDB Considerations

Current setup uses MongoDB Atlas (cloud-hosted). Options:

### Option A: Keep MongoDB Atlas (Recommended)
- Already configured and working
- Free tier: 512MB storage, shared RAM
- M0 cluster sufficient for card pack inventory
- No migration needed

### Option B: Self-Hosted on Platform
- Railway/Render can run MongoDB container
- More control but more management
- May cost more than Atlas free tier

**Recommendation**: Keep MongoDB Atlas. Free tier is sufficient for inventory data, and it's already set up.

---

## Cost Comparison for Digital Arcana

Assuming modest traffic (prototype to early growth):

| Component | Railway | Render | Fly.io |
|-----------|---------|--------|--------|
| Express + Socket.io | $5-10 | $0-7 | $5-10 |
| Redis | Included | $0-7 | $2-5 |
| MongoDB | Atlas Free | Atlas Free | Atlas Free |
| SSL/HTTPS | Included | Included | Included |
| **Total** | **$5-15/mo** | **$0-14/mo** | **$7-15/mo** |

**Note**: Render's free tier has limitations (sleep after inactivity, bandwidth caps) that may not suit a real-time game. Railway's pricing is more predictable.

---

## Recommendation

### For Immediate Deployment: Railway

**Why Railway**:
1. **Simplest path to production**: GitHub connect, auto-deploy, done
2. **All-in-one solution**: Server + Redis in same project
3. **WebSocket just works**: No configuration needed
4. **Predictable costs**: $5-15/month covers most prototype traffic
5. **Good documentation**: Active community, clear guides

**Implementation Steps**:
1. Create Railway account and project
2. Connect GitHub repository
3. Add Redis service (one click)
4. Configure environment variables
5. Deploy

### For Future Scaling: Fly.io

**When to Consider**:
- Player base becomes geographically distributed
- Latency optimization becomes priority
- Need edge deployment for better multiplayer experience

**Migration Path**: Both Railway and Fly.io use containers/Docker, making future migration feasible.

### Not Recommended: Split Architecture

The current monolithic Express server serving both frontend and Socket.io is appropriate for this project's scale and goals. Splitting adds complexity without significant benefit.

---

## Environment Variable Migration

Current setup uses `QOVERY_REDIS_*` environment variables. New hosting will need:

```bash
# Railway / Render / Fly.io equivalent
REDIS_URL=redis://...  # Platform provides this
MONGODB_URI=mongodb+srv://...  # Keep existing Atlas connection
PORT=3000  # Or platform-assigned port
NODE_ENV=production
```

---

## Next Steps

1. **Create Railway account** and connect repository
2. **Add Redis service** to Railway project
3. **Configure environment variables** (migrate from Qovery naming)
4. **Test deployment** with staging environment
5. **Monitor costs** after launch to verify ad revenue covers hosting

---

## Decision Matrix

| Factor | Weight | Railway | Render | Fly.io |
|--------|--------|---------|--------|--------|
| Setup simplicity | 25% | 5 | 4 | 3 |
| WebSocket support | 25% | 5 | 5 | 5 |
| Cost efficiency | 20% | 4 | 5 | 3 |
| Reliability | 15% | 4 | 4 | 5 |
| Global performance | 10% | 2 | 2 | 5 |
| Community/docs | 5% | 5 | 4 | 4 |
| **Weighted Score** | | **4.25** | **4.15** | **3.90** |

**Winner**: Railway (by small margin over Render)

---

## Sources

- [Railway Pricing](https://railway.com/pricing)
- [Railway Documentation](https://docs.railway.com/)
- [Render Pricing](https://render.com/pricing)
- [Fly.io Pricing](https://fly.io/pricing/)
- [Fly.io Resource Pricing](https://fly.io/docs/about/pricing/)
- [Vercel Backend Limitations](https://northflank.com/blog/vercel-backend-limitations)
- [Railway vs Render Comparison](https://northflank.com/blog/railway-vs-render)
- [Node.js Hosting Platforms 2026](https://runcloud.io/blog/best-node-js-hosting)
