# NEXORA Maps — privacy, security, legal and moderation drafts

Snapshot: 26 November 2026. **Draft requirements and notices, not legal certification or a security audit.** This documentation does not prove implemented protections. All TODO acceptance items remain unchecked in the supplied baseline. Only the main agent may update feature status after attaching reproducible evidence. No native road guidance, production admin, cloud sharing, background tracking or real community network is approved for use.

## Draft privacy notice for the development preview

NEXORA is a UK-oriented guest-first journey-planning and explicitly labelled simulated-navigation preview. It is not validated road-use guidance. The intended controller, registered address, contact, privacy contact and processor register are **TBD before an external pilot**. Do not publish a notice containing placeholder contact details as a complete legal notice. A future pilot must identify the controller, applicable rights/complaint route, processors, lawful basis and retention before collecting participant data.

The planned local guest store contains preferences, saved places/home-work labels, minimal planned routes, demo reports and optional trip history. History should be off until explicitly opted in. Home/work coordinates and journeys are sensitive even without an account. A local-only preference is not automatically anonymous. Do not collect vehicle plates, public contributor trails or exact historical GPS by default. Do not sell location trails, perform behavioural advertising or require registration for core planning.

Foreground location should be requested contextually, be optional for manual-origin planning and stop when a trip ends or the user disables it. The plan records an implemented but device-unverified foreground integration; this is not verified background/navigation capability. OS permission is not a lawful basis. Background location needs a separate purpose, freely given meaningful consent where appropriate, minimisation and approved DPIA/platform tests; it stays blocked. Simulated position must never be represented as real GPS.

Selecting a hosted route sends start/end/waypoint coordinates to the routing operator; a geocoder can receive query text or search coordinates; map tile requests disclose IP/network metadata and the viewed tile area to the tile operator. FOSSGIS says its routing requests are saved in its server log. NEXORA cannot promise those third parties retain nothing. Until their terms/privacy/retention are accepted by the responsible controller, use only synthetic/non-sensitive test journeys and clearly disclose the transfer. Configured licensed/self-hosted providers need a processor/controller role assessment and transfer safeguards. Public Nominatim is not configured. [1] [2] [3]

No default exact-trace upload, cloud sync, live sharing, AI location-history transmission or location analytics is authorised. Crash/log systems must scrub coordinates, queries, home/work labels, access tokens and route payloads. Aggregate metrics need purpose/minimisation and any required consent; no analytics implementation is asserted here. A future AI module requires separate meaningful consent, identifier redaction and precise-location minimisation, not consent bundled with navigation.

## Local storage, export and deletion contract

AsyncStorage is the planned guest persistence mechanism. It is not an encrypted secret vault. Store only the minimal permitted preferences/saved/demo data there. Service credentials and account tokens belong only in server secret management or appropriate OS secure storage. App sandboxing does not prove encryption, backup exclusion or immunity to other users of an unlocked device. Review iCloud/Android/device backups and browser storage behaviour before promising local confidentiality.

The privacy centre must show what is kept locally and what is sent to each provider. Export must provide a versioned machine-readable file containing only the guest's preferences, saved places, planned trips, opted-in history and local reports, with source/time and no credentials. Warn that an exported file may reveal home/work and must be stored safely. The platform sharing sheet is a deliberate user export, not background upload.

Delete must stop active location/session recording and clear the owned guest keys, home/work, recents, saved/planned/history/demo reports and cached identifying session state; do not wipe unrelated starter data. Refresh the UI and verify data stays absent after restart. If operating-system/browser caches, exported files or third-party provider logs are outside app deletion control, say so clearly. Later account deletion must also cover owned server records, active share tokens and backup-retention schedules; it is not implemented by a local clear-storage action. Export/delete acceptance is not claimed complete.

Proposed retention needs confirmation: no default persisted raw GPS; session position in volatile memory, cleared at trip end; provider routing inputs processed only for the request with redacted application logs; saved places/preferences until guest deletion; optional history until deletion or a chosen limit; incidents until category expiry plus justified restricted audit retention; sharing until arrival/revocation/expiry; account data until deletion subject to documented legal exceptions. Exact durations, third-party logs and backup deletion windows are **TBD and a release blocker**, not “retain forever”. Retention jobs and deletion/export integration tests are required for any cloud feature.

## Processing register and lawful-basis decisions

For each operation the controller must record purpose, fields, recipients, lawful basis, necessity, retention, user control and security. The following are draft decisions, not approved legal conclusions:

- Core manual route request: coordinates/query only to selected provider, purpose journey response, proposed contractual/service basis where applicable; legal review and provider role/retention unresolved.
- Foreground position: contextual location for an opted-in preview; clarify necessity and legal basis separately from OS permission. Minimise frequency and avoid persistence.
- Guest local preferences/saved places: local personalisation under user control; assess storage/privacy law applicability, backups and export.
- Optional history, cloud sync, background tracking, live sharing and AI: distinct optional purposes; assess separate consent and withdrawal, avoid service denial for refusing optional data.
- Community reports: segment/time/category/precision, not public identity or trails; assess lawful basis, abuse handling, authority-source licences, retention and appeal rights.
- Security logs and moderation audit: redacted data, necessity/legitimate-interest assessment as applicable, restricted access and bounded retention.

Finish the processor register, international transfer assessment, records of processing, age/children risk assessment and data-subject handling process before external use. Assess access, correction, erasure, portability, objection/restriction and consent withdrawal as applicable; provide a verified controller contact and ICO complaint route. Do not advertise children's suitability without an assessed design.

## DPIA and privacy gates

Complete a DPIA before high-risk systematic/precise background tracking, public incident aggregation, live trip sharing, vulnerable-user/children features, cloud exact history, camera recording, vehicle telemetry or AI location processing. Cover stalking/coercion, home-work inference, recipient leakage, inaccurate safety data, employee/child monitoring, misuse and deletion failures. Obtain qualified legal/data-protection review and resolve residual risk; regulator consultation where legally required is a separate decision. OS permission or a checkbox is not a substitute. The ICO DPIA guidance is currently under review following the Data (Use and Access) Act; qualified review must check current law and guidance before rollout. [5]

Gate owners are proposed roles, not assigned individuals: privacy lead/controller approves lawful bases, notice, retention/processors/transfers; security lead approves threat model and abuse controls; safety lead approves moving UX and guidance validation; engineering/QA provide evidence. No feature passes on a documentation signature alone. Background/cloud sharing/AI and camera remain disabled until their gates are evidenced and user/procurement approvals exist.

## Draft terms and road-safety notice

This preview supplies planning and test simulation only. Do not use it as live turn-by-turn driving guidance. Route estimates, map data, weather, charges, accessibility, availability and incident reports can be incomplete or stale. Unknown values must be marked unknown rather than replaced with zero, safe, closed or available. Road signs, laws, official advice and vehicle instruments take priority. No promise of a safe road, legal truck access, guaranteed ETA/charger, emergency dispatch or comparative superiority is made. A notice cannot excuse unsafe design or unlawfully remove consumer rights; final terms need legal review.

Do not hold/use this app while driving. UK handheld-device rules apply even when stopped at traffic lights or queuing; zero speed is not proof of safely parked. Use a safely parked workflow, or only separately validated hands-free interactions that keep the driver in control. Preview/device tests must be simulator, closed-course or passenger-operated without driver distraction. Emergency links may offer an official, user-initiated call only; no automatic emergency response. [4]

The name NEXORA is provisional: trademark/domain checks, app-store location/background declarations, CarPlay entitlement and Android Auto approval/requirements remain pending. No store release, purchase or publication is authorised. Do not scrape Google/Waze or imply access to their imagery/community data. Keep OSM/ODbL attribution visible and retain Leaflet BSD notices; see [SETUP.md](SETUP.md) for the pending dependency/data licence register. Map attribution is not a privacy notice.

## Jurisdiction feature policy — initial UK scope

**Speed-camera, red-light-camera, average-speed-camera and police/enforcement-related reporting are disabled in the UK preview, including local report menus, alerts, API categories and imported feeds.** This conservative product policy is not a claim that all such information is illegal in the UK. Each feature requires a current jurisdiction-specific legal/safety review and explicit approval before enabling it. Default unknown/global jurisdiction is also disabled. Do not offer enforcement-avoidance routing, advice or a workaround through generic free-text reports. Moderate euphemisms and provider text too.

Trusted congestion/roadworks/closure/weather hazards may be considered only with licensed/verified provenance, timestamps, appropriate regional semantics and expiry; no “road is safe” label. Camera AR/recording/dashcam are future feasibility items with explicit permissions, privacy/safety review and DPIA assessment, not MVP. No direct vehicle control. Music/voice/HUD/car-display integrations require permitted OS/provider APIs and platform validation.

Jurisdiction policy must be versioned with effective date, owner, allowed/blocked categories, source rights and legal-review record; all entries are pending beyond the conservative UK/unknown defaults. Re-evaluate rather than carrying UK assumptions globally. Tests must prove blocked categories cannot be created via deep links, payload manipulation or feed ingestion.

## Moderation procedure — local demo now, protected service later

There is **no public admin service**. The planned local moderator review UI handles isolated synthetic/demo records on the same development device. It is not authentication, a multi-user audit service or a production moderation console. Display “Local moderation demo only”; no local action should publish data or give remote admin rights. Never seed fake crowd confirmations or traffic. Show “no live reports available” whenever real coverage is absent.

1. Intake: accept manual reports only through a safely parked/stationary workflow outside moving playback; allow only approved categories. Record synthetic/demo provenance, observed time, segment/direction when trustworthy, precision, TTL and pending state. Strip names, plates, faces, public handles/home-work links and free-text personal data. Apply payload bounds and rate limits. No pending report is a hard closure.
2. Review: determine data source/licence, recency, geography and category; reject unsupported enforcement categories, personal data, threats, abuse, invented safety claims or unverified authority impersonation. Escalate imminent danger to an official user-initiated handoff, not implied dispatch.
3. Dedupe: merge only compatible category, segment, direction and time. Preserve provenance and independent confirmations. Popularity alone is not truth and new users must not be excluded merely for lack of reputation.
4. Decisions: approve/reject/quarantine/retract/expire with reason. Single unverified reports cannot force a hard reroute/closure. Only appropriately verified authority/legal data may produce hard infeasibility; corroborated reports need conservative disclosed treatment. Mark source, age, uncertainty and demo status visibly.
5. Expiry: use a reviewed per-category TTL, freshness decay and authority schedule bounds. Demo TTL values are test parameters, not guaranteed real hazard durations. “Not there” can reduce confidence/retract under the policy; reconnect queues must revalidate time/expiry and never resurrect stale reports as live.
6. Appeal/abuse: preserve a bounded redacted decision record, allow a reviewed appeal, apply proportionate bans/rate limits and record reason. A future production appeal contact, coverage/on-call roster, response targets and safeguarding/escalation policy are **TBD before beta**. No invented moderation SLA.

Real moderation needs managed authentication, deny-by-default RBAC, separate dev/staging/prod, per-row ownership, protected administrative routes, auditable review history, human staffing, source-ingest monitoring and legally reviewed retention. Anonymous admin requests must fail; role escalation, cross-account data access and public audit leakage require adversarial tests. The local demo does not satisfy these gates. No real provider ingestion or public incident submissions are approved here.

## Security engineering requirements and release checks

Threat model the native app, web iframe/WebView, bridge, API/provider proxy, local storage, future accounts/share links, moderation and ingestion. Validate coordinate bounds, query/payload size, schema/version, route response geometry and error states. Allowlist provider URLs on the server; prevent SSRF, open redirects and arbitrary bridge JavaScript. Bound timeouts/retries; enforce per-operation and shared provider quotas. Escape provider/POI/review text to prevent XSS and AI prompt injection. CORS, CSRF/session protections and content security rules need context-specific tests, not assumed defaults.

Use TLS, authenticated/authorised storage and platform/host encryption with verified configuration. Keep service keys server-side in private configuration/secret management; a `.env` file is not permission to ship a secret. Use key rotation, minimum privileges, dependency/secret scanning and versioned migrations. Never log coordinates, precise query text or raw provider payloads in routine crash/analytics logs. No unauthenticated admin or export/delete ownership bypass. An app-private preview URL is not a security control.

Future live-share links must use high-entropy tokens, explicit selected recipients, minimal/optional approximate location, short expiry, arrival termination, revocation and inaccessible expired endpoints; no indexable public trails or permanent tracking. Keep tokens out of logs/referrers. To preserve OSM tile referrers without leaking a future share token, resolve a token into a protected session then use a token-free canonical map URL with an origin-only cross-origin referrer policy that still sends a valid referrer to tiles. Do not render a token-bearing map page that leaks it. Sharing is blocked until this is tested.

Before external pilot, obtain secret/dependency scan results, cross-account/anonymous leakage tests, admin route denial, export/delete and revocation evidence, browser/WebView origin/header checks, data-flow review and rollback plan. Test encryption and retention on actual deployments; do not describe them as already enabled. The manifest tracks security clause SEC-01 without claiming compliance.

## Incident response and operations draft

Assign an incident commander, security contact, privacy lead and provider contacts before any beta. On suspected exposure or unsafe data: contain/disable feature flags and tokens, stop ingestion/sharing, preserve minimal restricted evidence, assess affected people/providers and safety impact, rotate credentials and correct data. Determine statutory breach reporting/notification duties with the privacy/legal lead, including the applicable authority-notification deadlines where required, and document the decision. No incident-response staffing or SLA is established by this draft. Run a tabletop and verified rollback exercise before release; communicate corrections without reproducing private coordinates publicly.

## References

[1]: https://routing.openstreetmap.de/about.html "FOSSGIS routing service and server-log privacy"
[2]: https://operations.osmfoundation.org/policies/tiles/ "OSMF tile usage and privacy constraints"
[3]: https://operations.osmfoundation.org/policies/nominatim/ "Public Nominatim restrictions"
[4]: https://www.gov.uk/using-mobile-phones-when-driving-the-law "UK driving device rules"

[5]: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/data-protection-impact-assessments-dpias/ "ICO DPIA guidance and current review caveat"
