# npm ci Warnings Analysis
*Generated: 2026-01-12*

## Executive Summary

Running `npm ci` produces 3 categories of warnings:
1. **Node version mismatch** - Multiple packages require Node >=20 (current: 18.20.8)
2. **Security vulnerabilities** - 29 total (18 low, 5 moderate, 6 high)
3. **Deprecated packages** - 15+ packages with deprecation warnings

## Priority Findings

### 🔴 CRITICAL: Node Version Mismatch

**Current:** Node v18.20.8 (npm 10.8.2)  
**Required:** Node >=20

**Affected packages:**
- All @taquito/* v24 packages (beacon-wallet, core, http-utils, local-forging, michel-codec, michelson-encoder, rpc, signer, taquito, utils)
- tr46@6.0.0
- webidl-conversions@8.0.1
- whatwg-url@15.1.0

**Recommendation:** Upgrade to Node 20 LTS or Node 22 LTS
- **Actionable:** YES - High Priority
- **Impact:** Major - Unsupported engines may cause runtime issues

### 🔴 HIGH: Security Vulnerabilities (6)

#### 1. @pinata/sdk - axios vulnerability
- **Severity:** High
- **Fix Available:** NO
- **Recommendation:** Migrate to pinata-web3 (already deprecated anyway)
- **Actionable:** YES - Required

#### 2. parse-duration - ReDoS (CVE/GHSA-hcrg-fc28-fcg5)
- **Severity:** High (CVSS 7.5)
- **Issue:** Regex Denial of Service causing event loop delay and OOM
- **Affected:** ipfs-core-utils → ipfs-car → nft.storage
- **Fix Available:** Downgrade nft.storage to 3.4.0 (semver major)
- **Actionable:** YES if nft.storage v3.4.0 works with codebase

#### 3. crypto-browserify - timing attack (CVE-2023-35920)
- **Severity:** High (CVSS 7.5)
- **Issue:** randomfill() timing attack allows seed recovery
- **Affected:** Multiple packages including @taquito/beacon-wallet
- **Fix Available:** Requires major version downgrades
- **Actionable:** MAYBE - needs testing

### 🟡 MODERATE: Security Vulnerabilities (5)

#### 1. vitest ecosystem (vite, vite-node, vitest, @vitest/coverage-v8)
- **Fix:** Upgrade to vitest@3.2.4, vite@6.4.1, @vitest/coverage-v8@4.0.16
- **Breaking:** YES - major version upgrades
- **Actionable:** YES - test suite should be updated

#### 2. esbuild vulnerabilities
- **Affected:** vite (indirect)
- **Fix:** Included in vite upgrade
- **Actionable:** Addressed by vite upgrade

### 🟢 LOW: Security Vulnerabilities (18)

Multiple low-severity vulnerabilities in:
- @airgap/beacon-* packages (elliptic, @walletconnect dependencies)
- @ethersproject/* packages (elliptic)
- @walletconnect/* packages
- elliptic package (multiple CVEs)

**Recommendation:** Monitor but low priority. May be addressed by major dependency updates.

## Deprecated Packages

### High Priority Replacements

1. **@pinata/sdk** → **pinata-web3**
   - Officially deprecated
   - New SDK available
   - **Actionable:** YES

2. **js-IPFS packages** → **Helia**
   - ipfs-core-utils@0.12.2 - deprecated
   - ipfs-core-types@0.8.4 - deprecated
   - See: https://github.com/ipfs/js-ipfs/issues/4336
   - **Actionable:** MAYBE - depends on nft.storage usage

3. **inflight@1.0.6** → **lru-cache**
   - Memory leak
   - No longer supported
   - **Actionable:** MAYBE - if used directly (likely indirect dependency)

### Medium Priority Replacements

4. **glob@7.2.3** → **glob@9+**
   - Versions prior to v9 no longer supported
   - **Actionable:** YES - safe upgrade

5. **lodash.isequal@4.5.0** → **node:util.isDeepStrictEqual**
   - Modern native alternative available
   - **Actionable:** MAYBE - if used directly

6. **multiaddr/multibase/multicodec/cids** → **multiformats**
   - Multiple packages superseded
   - **Actionable:** MAYBE - depends on IPFS migration

### Low Priority

7. **@walletconnect/sign-client@2.18.0** - Upgrade for reliability/performance
8. **node-domexception@1.0.0** - Use platform native DOMException
9. **multiaddr-to-uri@8.0.0** - Upgrade to @multiformats/multiaddr-to-uri

## Recommended Action Plan

### Immediate Actions (P0)

1. **Upgrade to Node 20 LTS**
   - Resolves 17 EBADENGINE warnings
   - Required for @taquito v24 compatibility
   - Low risk, high impact

2. **Replace @pinata/sdk with pinata-web3**
   - Resolves 1 high severity vulnerability
   - Official migration path
   - Required due to deprecation

### High Priority (P1)

3. **Evaluate nft.storage downgrade to 3.4.0**
   - Would fix parse-duration ReDoS vulnerability
   - Test for compatibility
   - Alternative: Find replacement for nft.storage

4. **Upgrade vitest/vite ecosystem**
   - vitest@3.2.4, vite@6.4.1, @vitest/coverage-v8@4.0.16
   - Fixes 4 moderate severity vulnerabilities
   - Breaking changes - test suite needs validation

### Medium Priority (P2)

5. **Investigate crypto-browserify vulnerability**
   - Determine actual impact on application
   - Consider if timing attack is exploitable in this context

6. **Upgrade glob to v9+**
   - Low risk, maintenance update

7. **Review IPFS/Helia migration**
   - Long-term: migrate from js-IPFS to Helia
   - Depends on nft.storage usage and roadmap

### Low Priority (P3)

8. **Monitor low severity vulnerabilities**
   - Most are in wallet/blockchain dependencies
   - May be addressed by ecosystem updates

9. **Clean up other deprecated packages**
   - multiformat migrations
   - lodash.isequal replacement
   - @walletconnect upgrades

## Noise vs. Signal

### Treat as Noise
- Low severity elliptic vulnerabilities (unless actively exploited)
- Deprecated packages that are indirect dependencies of soon-to-be-replaced packages
- EBADENGINE warnings (once Node is upgraded)

### Treat as Signal
- Node version mismatch (blocks future updates)
- High severity vulnerabilities with fixes available
- Deprecated packages that are direct dependencies
- Testing framework updates (vitest/vite)

## Notes

- npm audit fix would address some issues but requires --force for breaking changes
- Many vulnerabilities cascade through dependency chains
- IPFS ecosystem is in transition (js-IPFS → Helia), affecting multiple packages
