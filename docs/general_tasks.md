  Epics 8–13 — Phase 2 Breakdown                                                                                                                                                                                            
  EPIC 10 — Text-to-Video Pipeline
                                  
  ▎ End-to-end: user types a prompt → system generates a complete video with audio, captions, and transitions.
                                                                                                                                                                                                                   
  Pages / Surfaces:
  - Text-to-Video wizard modal — multi-step prompt → configure → generate                                                                                                                                          
  - Generation progress page — shows each step completing                                                                                                                                                          
   
  ---                                                                                                                                                                                                              
  [BE] Text-to-Video Orchestrator Service
                                                                                                                                                                                                                   
  Description: Build a high-level orchestrator in apps/api/src/services/text-to-video.service.ts that takes a text prompt and generates a full video project. Steps: (1) Use OpenAI/Claude to generate a
  script/storyboard (scene descriptions, narration text, caption text), (2) Generate video clips per scene via video provider, (3) Generate narration audio via TTS, (4) Generate background music, (5) Assemble   
  all assets into a ProjectDoc with tracks, clips, and captions. Each step is a BullMQ job in a chain.
                                                                                                                                                                                                                   
  Acceptance Criteria:
  - POST /projects/:id/text-to-video accepts { prompt, duration, format, style }
  - Step 1: LLM generates structured storyboard JSON { scenes: [{ description, narration, duration }] }
  - Step 2: Video generation jobs enqueued per scene (parallel)                                        
  - Step 3: TTS job generates narration audio per scene                                                                                                                                                            
  - Step 4: Background music generation job (single track, full duration)                                                                                                                                          
  - Step 5: Assembly job creates ProjectDoc with all assets placed on timeline                                                                                                                                     
  - Returns { jobId } — status endpoint shows current step + overall progress                                                                                                                                      
  - Timeout: 15 minutes total; individual steps timeout at 5 minutes                                                                                                                                               
                                                                                                                                                                                                                   
  Dependencies: AI generation adapters (Epic 9), Whisper captions (Epic 3)                                                                                                                                         
  Effort: L ⚠️  Multi-step orchestration with failure recovery is complex; consider Temporal for durable workflows                                                                                                  
                                                                                                                                                                                                                   
  ---                                                                                                                                                                                                              
  [BE] LLM Script/Storyboard Generator                                                                                                                                                                             
                                                                                                                                                                                                                   
  Description: Build a service that takes a user's text prompt and generates a structured storyboard using an LLM (OpenAI GPT-4 or Claude). The storyboard defines scenes with visual descriptions, narration text,
   suggested duration, and transition hints.                                                                                                                                                                       
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - Calls LLM with a system prompt that produces structured JSON output
  - Output schema: { title, scenes: [{ sceneNumber, visualDescription, narrationText, durationSeconds, transitionHint }], totalDurationSeconds }                                                                   
  - Validates LLM output against Zod schema (retry once on parse failure)                                                                       
  - Respects user-specified total duration (distributes across scenes)                                                                                                                                             
  - Supports style hints: "cinematic", "corporate", "social media", "educational"                                                                                                                                  
                                                                                                                                                                                                                   
  Dependencies: None (uses OpenAI/Anthropic API directly)                                                                                                                                                          
  Effort: M                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---             
  [BE] Auto-Caption Generation for Text-to-Video                                                                                                                                                                   
                                                
  Description: After narration audio is generated, automatically run Whisper transcription to produce word-level captions. Place captions on a dedicated overlay track in the assembled ProjectDoc.
                                                                                                                                                                                                                   
  Acceptance Criteria:
  - Whisper transcription runs automatically on generated narration audio                                                                                                                                          
  - Captions added as text-overlay clips on a dedicated "Captions" track                                                                                                                                           
  - Caption timing matches narration audio (word-level alignment)       
  - Caption style defaults: white text, black outline, bottom-center position                                                                                                                                      
                                                                                                                                                                                                                   
  Dependencies: Whisper transcription (Epic 3), TTS audio generation                                                                                                                                               
  Effort: S                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---             
  [FE] Text-to-Video Wizard Modal
                                                                                                                                                                                                                   
  Description: Build a multi-step wizard modal triggered from the editor's "AI" menu or a prominent "Create Video from Text" button. Steps: (1) Enter prompt + style, (2) Configure duration/format/resolution, (3)
   Review generated storyboard (editable), (4) Generate → progress view.                                                                                                                                           
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - Step 1: Multiline prompt input + style dropdown (cinematic/corporate/social/educational)
  - Step 2: Duration slider (15s–5min), format dropdown (16:9, 9:16, 1:1), resolution from project settings                                                                                                        
  - Step 3: Shows LLM-generated storyboard — each scene card shows description + narration + duration; user can edit text or reorder scenes
  - Step 4: "Generate Video" button → progress view showing each step with status icons                                                                                                                            
  - Progress updates in real-time (polls job status every 3s)                                                                                                                                                      
  - On completion: project loads the assembled video in the editor, user can edit further                                                                                                                          
  - Cancel button available at any step; cancels in-progress generation jobs                                                                                                                                       
  - Error handling per step with "Retry" option                                                                                                                                                                    
                                                                                                                                                                                                                   
  Dependencies: Text-to-video orchestrator BE                                                                                                                                                                      
  Effort: L                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---             
  Summary — Epic 10
                   
  ┌────────────────────────────┬──────┬────────┬────────────────────────────────────────────┐
  │           Ticket           │ Area │ Effort │                 Depends On                 │                                                                                                                      
  ├────────────────────────────┼──────┼────────┼────────────────────────────────────────────┤
  │ LLM storyboard generator   │ BE   │ M      │ None                                       │                                                                                                                      
  ├────────────────────────────┼──────┼────────┼────────────────────────────────────────────┤
  │ Text-to-video orchestrator │ BE   │ L      │ AI adapters (Epic 9), storyboard generator │
  ├────────────────────────────┼──────┼────────┼────────────────────────────────────────────┤                                                                                                                      
  │ Auto-caption for TTV       │ BE   │ S      │ Orchestrator, Whisper (Epic 3)             │
  ├────────────────────────────┼──────┼────────┼────────────────────────────────────────────┤                                                                                                                      
  │ Text-to-video wizard modal │ FE   │ L      │ Orchestrator BE                            │
  └────────────────────────────┴──────┴────────┴────────────────────────────────────────────┘                                                                                                                      
                  
  Build order: Storyboard generator first (can be tested independently). Orchestrator is the critical path — needs all AI adapters from Epic 9. FE wizard can start with mocked responses while orchestrator is    
  being built.    
                                                                                                                                                                                                                   
  ---             
  EPIC 11 — Social Media Publishing
                                                                                                                                                                                                                   
  ▎ Direct publish to YouTube, TikTok, and Instagram from the export flow.
                                                                                                                                                                                                                   
  Pages / Surfaces:
  - Social accounts settings page — connect/disconnect accounts                                                                                                                                                    
  - Publish modal — metadata form + platform selection (extends Export modal)
  - Publish history/status page                                              
                                                                                                                                                                                                                   
  ---                                                                                                                                                                                                              
  [DB] Social Accounts + Publish Jobs Schema                                                                                                                                                                       
                                                                                                                                                                                                                   
  Description: Create social_accounts (OAuth tokens per platform per user) and publish_jobs (track publish attempts) tables.
                                                                                                                                                                                                                   
  Acceptance Criteria:
  - social_accounts: account_id, user_id, platform (ENUM: youtube, tiktok, instagram), platform_user_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, display_name, avatar_url, created_at   
  - publish_jobs: job_id, user_id, render_job_id, platform, status (ENUM: queued, uploading, processing, published, failed), platform_post_id, platform_url, metadata_json, error_message, created_at, updated_at  
  - UNIQUE on (user_id, platform, platform_user_id)                                                                                                                                                              
  - Migration reversible                                                                                                                                                                                           
                  
  Dependencies: Users table (Epic 8)                                                                                                                                                                               
  Effort: S       
                                                                                                                                                                                                                   
  ---             
  [BE] YouTube OAuth + Upload Integration
                                                                                                                                                                                                                   
  Description: Build YouTube Data API v3 integration: OAuth2 connect flow, video upload, metadata (title, description, tags, category, visibility, thumbnail). Uses resumable upload for large files.
                                                                                                                                                                                                                   
  Acceptance Criteria:
  - GET /auth/youtube → Google OAuth with YouTube scope                                                                                                                                                            
  - GET /auth/youtube/callback → stores tokens in social_accounts                                                                                                                                                  
  - POST /publish/youtube accepts { renderJobId, title, description, tags[], categoryId, visibility, thumbnailAssetId? }
  - Validates render job is complete, downloads from S3                                                                                                                                                            
  - Uses YouTube resumable upload protocol for videos >5MB                                                                                                                                                         
  - Sets title (max 100 chars), description (max 5000 chars), tags, category                                                                                                                                       
  - Uploads custom thumbnail if provided                                                                                                                                                                           
  - Returns { publishJobId } — polls via GET /publish/:jobId                                                                                                                                                       
  - Handles quota errors (10,000 units/day) with clear error message                                                                                                                                               
  - Token refresh when access token expires                                                                                                                                                                        
                                                                                                                                                                                                                   
  Dependencies: Social accounts DB, render pipeline (Epic 5)                                                                                                                                                       
  Effort: L ⚠️  YouTube API quota limits are strict; resumable upload adds complexity                                                                                                                               
                                                                                                                                                                                                                   
  ---                                                                                                                                                                                                              
  [BE] TikTok Content Posting API Integration                                                                                                                                                                      
                                             
  Description: Build TikTok Content Posting API integration. TikTok uses a different flow: init upload → upload chunks → create post with metadata.
                                                                                                                                                                                                                   
  Acceptance Criteria:
  - GET /auth/tiktok → TikTok OAuth                                                                                                                                                                                
  - GET /auth/tiktok/callback → stores tokens                                                                                                                                                                      
  - POST /publish/tiktok accepts { renderJobId, caption, allowComments, allowDuet, allowStitch, visibility }
  - Uploads video via TikTok's chunk-based upload API                                                                                                                                                              
  - Sets caption (max 2200 chars), privacy settings                                                                                                                                                                
  - Handles TikTok's async publishing (video goes through review)                                                                                                                                                  
  - Returns { publishJobId } with status tracking                                                                                                                                                                  
  - Token refresh with TikTok's refresh flow                                                                                                                                                                       
                                                                                                                                                                                                                   
  Dependencies: Social accounts DB, render pipeline                                                                                                                                                                
  Effort: L ⚠️  TikTok API review process can take up to 5 days; different SDK patterns                                                                                                                             
                                                                                                                                                                                                                   
  ---                                                                                                                                                                                                              
  [BE] Instagram Graph API Integration                                                                                                                                                                             
                                      
  Description: Build Instagram Graph API integration for Reels and feed posts. Instagram requires a Facebook Page linked to an Instagram Professional account.
                                                                                                                                                                                                                   
  Acceptance Criteria:                                                                                                                                                                                             
  - GET /auth/instagram → Facebook OAuth with Instagram scope                                                                                                                                                      
  - GET /auth/instagram/callback → stores tokens                                                                                                                                                                   
  - POST /publish/instagram accepts { renderJobId, caption, mediaType: 'reel'|'feed', coverTimestamp? }
  - For Reels: uses container-based creation flow (create container → upload → publish)                
  - Caption max 2200 chars, hashtags counted as part of caption                                                                                                                                                    
  - Handles Instagram's async processing (container status polling)                                                                                                                                                
  - Returns { publishJobId } with status tracking                                                                                                                                                                  
  - Validates aspect ratio requirements per media type                                                                                                                                                             
                                                                                                                                                                                                                   
  Dependencies: Social accounts DB, render pipeline                                                                                                                                                                
  Effort: L ⚠️  Instagram API requires Facebook Business account; complex container-based upload
                                                                                                                                                                                                                   
  ---             
  [FE] Social Accounts Settings Page                                                                                                                                                                               
                                    
  Description: Build /settings/social-accounts page showing connected platforms. Each platform card shows: icon, name, connected account info, connect/disconnect buttons.
                                                                                                                                                                                                                   
  Acceptance Criteria:                                                                                                                                                                                             
  - Cards for YouTube, TikTok, Instagram                                                                                                                                                                           
  - "Connect" button initiates OAuth flow                                                                                                                                                                          
  - Connected accounts show display name + avatar
  - "Disconnect" button with confirmation dialog 
  - Status indicators: connected (green), disconnected (gray), token expired (yellow warning)                                                                                                                      
  - Dark theme, consistent with design system                                                
                                                                                                                                                                                                                   
  Dependencies: OAuth endpoints for all platforms
  Effort: M                                                                                                                                                                                                        
                  
  ---                                                                                                                                                                                                              
  [FE] Publish Modal (extends Export)
                                     
  Description: After a render completes, add a "Publish" button alongside "Download". Opens a publish modal where users select target platforms, fill in per-platform metadata, and submit. Each platform has a
  metadata form section.                                                                                                                                                                                           
  
  **Acceptance                                                                                                                                                                                                              
  ---             
  EPIC 12 — Animations & Animated Transitions

  ---
  [Schema] Animation and Transition Types in project-schema
                                                                                                                                                                                                                   
  Description: Extend packages/project-schema/ with animation types. Add clipAnimationSchema (entry/exit animations per clip: fade, slide, zoom, bounce, etc.) and transitionSchema (between adjacent clips on same
   track: crossfade, wipe, dissolve, slide). Each has type, durationFrames, easing, and type-specific parameters.                                                                                                  
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - ClipAnimation type: { type: 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'zoom-in' | 'zoom-out' | 'bounce', durationFrames: number, easing: 'linear' | 'ease-in' | 'ease-out' | 
  'ease-in-out' | 'spring' }                                                                                                                                                                                       
  - Transition type: { type: 'crossfade' | 'wipe-left' | 'wipe-right' | 'dissolve' | 'slide-push', durationFrames: number, easing: string }
  - VideoClip, ImageClip, AudioClip schemas extended with optional entryAnimation?, exitAnimation?                                                                                                                 
  - Track schema extended with optional transitions?: Transition[] (each has afterClipId)                                                                                                                          
  - Zod schemas + TypeScript types exported                                                                                                                                                                        
  - Existing tests pass; new tests cover animation/transition variants                                                                                                                                             
                                                                                                                                                                                                                   
  Dependencies: None                                                                                                                                                                                               
  Effort: S                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---             
  [FE/Remotion] Implement Clip Animations in Remotion Compositions
                                                                                                                                                                                                                   
  Description: Update packages/remotion-comps/ layer components (VideoLayer, ImageLayer, TextOverlayLayer) to apply entry/exit animations using Remotion's interpolate() and spring(). Each animation type maps to
  CSS transform/opacity interpolations. Animations apply within the clip's frame range (entry at start, exit at end).                                                                                              
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - Fade: interpolates opacity 0→1 (entry) and 1→0 (exit) over durationFrames
  - Slide variants: interpolate translateX/translateY from off-screen to position                                                                                                                                  
  - Zoom: interpolate scale from 0→1 (in) or 1→0 (out)                           
  - Bounce: uses Remotion spring() for natural bounce easing                                                                                                                                                       
  - Easing options map to Remotion's Easing module          
  - Animations stack correctly (entry + exit on same clip)                                                                                                                                                         
  - No animation when entryAnimation/exitAnimation is undefined (backwards compatible)                                                                                                                             
  - Storybook stories demonstrate each animation type                                                                                                                                                              
                                                                                                                                                                                                                   
  Dependencies: Animation schema types                                                                                                                                                                             
  Effort: M                                                                                                                                                                                                        
                  
  ---                                                                                                                                                                                                              
  [FE/Remotion] Implement Transitions Between Clips
                                                   
  Description: Implement track-level transitions in VideoComposition. When two adjacent clips on the same track have a transition, overlap them by transition.durationFrames and apply the visual effect.
  Crossfade: blend opacity of outgoing and incoming clip. Wipe: use a clip-path or mask animation. Dissolve: similar to crossfade with noise texture.                                                              
  
  ⚠️  Transitions require clips to overlap by the transition duration. The composition must handle the overlap zone specially — rendering both clips simultaneously with the transition effect applied.             
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - Crossfade: outgoing clip fades out while incoming fades in over overlap duration
  - Wipe: clip-path animation reveals incoming clip from the specified direction                                                                                                                                   
  - Dissolve: noise-based crossfade effect                                      
  - Slide-push: outgoing slides out while incoming slides in                                                                                                                                                       
  - Clips automatically overlap by transition.durationFrames in the composition                                                                                                                                    
  - Transitions render correctly in both Player preview and SSR render                                                                                                                                             
  - No transition when transitions array is empty or undefined                                                                                                                                                     
  - Audio crossfade: volume ramp down/up for audio tracks                                                                                                                                                          
                                                                                                                                                                                                                   
  Dependencies: Animation schema types, Remotion composition updates                                                                                                                                               
  Effort: L ⚠️  Overlapping clip rendering in Remotion requires careful Sequence nesting                                                                                                                            
                                                                                                                                                                                                                   
  ---                                                                                                                                                                                                              
  [FE] Animation Inspector Panel                                                                                                                                                                                   
                                
  Description: When a clip is selected, add an "Animations" section to the right-sidebar inspector. Shows entry animation dropdown (none, fade, slide-left, etc.), exit animation dropdown, duration slider for
  each, easing selector. Changes update the project document via Immer (live preview in Player).                                                                                                                   
  
  Acceptance Criteria:                                                                                                                                                                                             
  - Entry animation: dropdown with all animation types + "None"
  - Exit animation: same dropdown                                                                                                                                                                                  
  - Duration slider: 0.1s – 2.0s (converted to frames using project FPS)
  - Easing selector: linear, ease-in, ease-out, ease-in-out, spring                                                                                                                                                
  - Changes reflected immediately in the Remotion Player preview                                                                                                                                                   
  - Changes produce Immer patches (undoable)                                                                                                                                                                       
  - Panel section collapsed by default; expands on click                                                                                                                                                           
                                                                                                                                                                                                                   
  Dependencies: Remotion animation implementation
  Effort: S                                                                                                                                                                                                        
                  
  ---                                                                                                                                                                                                              
  [FE] Transition Picker on Timeline
                                    
  Description: Between two adjacent clips on the same track, show a small "+" icon on hover. Clicking opens a transition picker dropdown. Selecting a transition adds it to the track's transitions array. The
  timeline visually indicates transitions with a diamond/overlap marker between clips. Double-clicking the marker opens duration/easing controls.                                                                  
  
  Acceptance Criteria:                                                                                                                                                                                             
  - "+" icon appears on hover between adjacent clips on same track
  - Transition picker shows: None, Crossfade, Wipe Left, Wipe Right, Dissolve, Slide Push                                                                                                                          
  - Selected transition shown as a diamond icon between clips on timeline                
  - Clips visually overlap by transition duration on the timeline                                                                                                                                                  
  - Double-click transition marker opens duration/easing popover                                                                                                                                                   
  - Removing transition restores clip positions (undo via Immer)                                                                                                                                                   
  - Works for video, image, and audio tracks                                                                                                                                                                       
                                                                                                                                                                                                                   
  Dependencies: Remotion transition implementation                                                                                                                                                                 
  Effort: M                                                                                                                                                                                                        
                  
  ---
  [BE] Auto-Animation Generation Endpoint
                                                                                                                                                                                                                   
  Description: Build POST /projects/:id/auto-animate that analyzes the project's clips and automatically suggests/applies animations and transitions. Uses GPT-4 to analyze clip types, durations, and content (via
   thumbnail descriptions) and returns recommended animations for each clip and transitions between adjacent clips. The endpoint can either return suggestions (dry-run) or apply them directly.                   
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - Accepts { mode: 'suggest' | 'apply', style: 'energetic' | 'calm' | 'professional' | 'cinematic' }
  - suggest mode: returns { clips: [{ clipId, entryAnimation, exitAnimation }], transitions: [{ afterClipId, transition }] } without modifying project                                                             
  - apply mode: updates the project document with suggestions and creates a new version                                                               
  - GPT-4 prompt includes clip count, types, durations, and style preference                                                                                                                                       
  - Animations match the requested style (e.g., "energetic" = bounces + fast slides; "calm" = slow fades)                                                                                                          
  - Rate-limited: 5 requests per project per hour                                                                                                                                                                  
                                                                                                                                                                                                                   
  Dependencies: Animation schema, OpenAI provider (Epic 8)                                                                                                                                                         
  Effort: M                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---                                                                                                                                                                                                              
  Summary — Epic 11

  ┌────────────────────────────────────┬─────────────┬────────┬──────────────────────────┐
  │               Ticket               │    Area     │ Effort │        Depends On        │
  ├────────────────────────────────────┼─────────────┼────────┼──────────────────────────┤
  │ Animation + Transition schemas     │ Schema      │ S      │ None                     │
  ├────────────────────────────────────┼─────────────┼────────┼──────────────────────────┤
  │ Clip animations in Remotion        │ FE/Remotion │ M      │ Schema                   │                                                                                                                         
  ├────────────────────────────────────┼─────────────┼────────┼──────────────────────────┤                                                                                                                         
  │ Transitions between clips          │ FE/Remotion │ L      │ Schema + animations      │                                                                                                                         
  ├────────────────────────────────────┼─────────────┼────────┼──────────────────────────┤                                                                                                                         
  │ Animation inspector panel          │ FE          │ S      │ Remotion animations      │
  ├────────────────────────────────────┼─────────────┼────────┼──────────────────────────┤                                                                                                                         
  │ Transition picker on timeline      │ FE          │ M      │ Remotion transitions     │
  ├────────────────────────────────────┼─────────────┼────────┼──────────────────────────┤                                                                                                                         
  │ Auto-animation generation endpoint │ BE          │ M      │ Schema + OpenAI provider │
  └────────────────────────────────────┴─────────────┴────────┴──────────────────────────┘

  Build order: Schema first (unblocks everything). Remotion clip animations next (simpler than transitions). Transitions are the hardest — spike the overlap rendering pattern early. FE panels can develop with   
  mock data. Auto-animate endpoint is independent and can be built once the schema is stable.
                                                                                                                                                                                                                   
  ---             
  EPIC 13 — Polish, Performance & Production Readiness

  ---
  [INFRA] Production Deployment Configuration
                                                                                                                                                                                                                   
  Description: Set up production deployment: Docker images for API, web-editor (static build + nginx), render-worker, media-worker. CI/CD pipeline (GitHub Actions) for build, test, lint, and deploy. Environment
  variable management. Health check endpoints. Logging with structured JSON output.                                                                                                                                
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - Multi-stage Dockerfiles for all 4 apps (build + slim runtime)
  - docker-compose.prod.yml with production defaults                                                                                                                                                               
  - GitHub Actions workflow: lint → test → build → push images
  - GET /health endpoint on API returning { status, version, uptime }                                                                                                                                              
  - Structured JSON logging (not console.log) in all apps                                                                                                                                                          
  - Graceful shutdown handlers for all workers                                                                                                                                                                     
                                                                                                                                                                                                                   
  Dependencies: None                                                                                                                                                                                               
  Effort: M                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---             
  [BE] Rate Limiting, CORS, and Security Hardening
                                                  
  Description: Replace the existing placeholder CORS and rate-limit configs with production-ready settings. Add Helmet CSP headers, CORS whitelist per environment, per-route rate limits, request body size
  limits, and SQL injection prevention audit.                                                                                                                                                                      
  
  Acceptance Criteria:                                                                                                                                                                                             
  - CORS whitelist from environment variable (no * in production)
  - Helmet CSP configured for Remotion Player requirements (blob:, data:)                                                                                                                                          
  - Per-route rate limits: auth endpoints (stricter), generation endpoints (moderate), CRUD (relaxed)
  - Request body limit: 10MB for JSON, rejection for larger                                                                                                                                                        
  - All SQL queries use parameterized queries (audit existing code)                                                                                                                                                
  - HTTPS-only cookies in production                                                                                                                                                                               
                                                                                                                                                                                                                   
  Dependencies: Auth (Epic 7)                                                                                                                                                                                      
  Effort: S                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---             
  [FE] Error Boundaries + Offline Indicator
                                                                                                                                                                                                                   
  Description: Add React error boundaries around each major panel (Asset Browser, Timeline, Preview, Inspector) so a crash in one panel doesn't take down the entire editor. Add a network status indicator in the
  TopBar that warns when the user goes offline and queues saves for when they reconnect.                                                                                                                           
                  
  Acceptance Criteria:                                                                                                                                                                                             
  - Error boundary per panel with "Something went wrong" fallback + retry button
  - Errors logged to console with component stack                                                                                                                                                                  
  - Network offline: TopBar shows "Offline — changes saved locally" banner
  - Auto-save pauses when offline; resumes and flushes on reconnect                                                                                                                                                
  - "Reconnected" toast when network returns                                                                                                                                                                       
                                                                                                                                                                                                                   
  Dependencies: None                                                                                                                                                                                               
  Effort: S                                                                                                                                                                                                        
                                                                                                                                                                                                                   
  ---
  [FE] Keyboard Shortcuts Summary + Help Modal                                                                                                                                                                     
                                              
  Description: Build a keyboard shortcuts help modal (triggered by ? key or Help menu). Lists all available shortcuts grouped by category: Playback, Timeline, Clips, General. This documents existing shortcuts
  and new ones added across epics.                                                                                                                                                                                 
  
  Acceptance Criteria:                                                                                                                                                                                             
  - ? key opens the modal (when not in a text input)
  - Categories: Playback (Space, Left/Right, Home), Timeline (Ctrl+Z, Ctrl+Shift+Z, Delete), General (Ctrl+S save, Ctrl+E export)                                                                                  
  - Styled consistently with existing modals (dark theme, SURFACE_ELEVATED)                                                      
  - Dismissible via Escape or backdrop click                                                                                                                                                                       
                                                                                                                                                                                                                   
  Dependencies: None                                                                                                                                                                                               
  Effort: XS                                                                                                                                                                                                       
                  
  ---
  Summary — Epic 13
                                                                                                                                                                                                                   
  ┌──────────────────────────────────────┬───────┬────────┬───────────────┐
  │                Ticket                │ Area  │ Effort │  Depends On   │                                                                                                                                        
  ├──────────────────────────────────────┼───────┼────────┼───────────────┤
  │ Production deployment config         │ INFRA │ M      │ None          │
  ├──────────────────────────────────────┼───────┼────────┼───────────────┤
  │ Security hardening                   │ BE    │ S      │ Auth (Epic 7) │
  ├──────────────────────────────────────┼───────┼────────┼───────────────┤                                                                                                                                        
  │ Error boundaries + offline indicator │ FE    │ S      │ None          │
  ├──────────────────────────────────────┼───────┼────────┼───────────────┤                                                                                                                                        
  │ Keyboard shortcuts help modal        │ FE    │ XS     │ None          │
  └──────────────────────────────────────┴───────┴────────┴───────────────┘