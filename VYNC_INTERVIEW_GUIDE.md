# Vync — Complete Project Mastery Guide (Chapter-wise)

> Ise itni baar padho ki har chapter ka flow tumhe zubani yaad ho jaaye.
> Har chapter me: **Kya hai → Kaise kaam karta hai → Code kahan hai → Interview me kya bolna hai**

---

## Chapter 0 — Ek Line Ka Pitch (ratt lo)

> "Vync ek Loom-alternative hai — ek Electron desktop app se screen record hoti hai, chunks real-time WebSocket pe ek Express media server ko stream hote hain, wahan file assemble hoke Cloudinary pe jaati hai, Google Gemini us video ka transcript + summary generate karta hai, aur Next.js web dashboard pe wo video workspaces, folders, timestamped comments aur sharable link ke saath serve hoti hai."

**Agar poochhe "sabse mushkil kya tha?"** → "Chunked upload me chronological order guarantee karna. MediaRecorder har second ek blob deta hai, socket pe wo out-of-order ya race condition me aa sakte the. Maine per-file ek persistent `fs.createWriteStream` map me rakha (append mode) — Node ka write stream internally queue karta hai, isliye order guaranteed. Aur processing shuru karne se pehle stream ko `await` karke properly close karta hoon, warna aadhi likhi file Gemini ko chali jaati thi."

---

## Chapter 1 — Architecture: 3 Alag Applications, Ek Product

Ye **monorepo-style 3 apps** hain (technically 3 independent projects ek repo me):

```
Vync/
├── Vync first/     → Next.js 16 web app (dashboard, auth, DB, AI actions)   :3000
├── vync-desktop/   → Electron 30 + Vite + React desktop recorder            :5173
└── vync-express/   → Express 5 + Socket.io media ingestion server            :5001
```

### Ye 3 kyun? (ye question 100% aayega)

| App | Kyun alag hai |
|---|---|
| **Next.js** | Business logic, DB, auth, UI. Serverless (Vercel) pe chalta hai — long-lived socket connection nahi rakh sakta. |
| **Express** | Video chunks ek **stateful, long-lived** connection pe aate hain aur disk pe append hote hain. Ye serverless me possible hi nahi. Isliye alag stateful server. |
| **Electron** | Browser se **poori screen / dusri windows** capture nahi kar sakte. `desktopCapturer` sirf Electron ke main process me milta hai. Isliye native desktop app. |

**Bolne wali line:** "Maine responsibility ke hisaab se split kiya — stateless business logic Vercel pe, stateful media ingestion apne Express server pe, aur OS-level screen access Electron me. Ye separation isliye zaroori tha kyunki teeno ke runtime constraints alag hain."

---

## Chapter 2 — Tech Stack aur Har Choice Ka Reason

**Web (`Vync first/package.json`)**
- Next.js 16 (App Router) + React 19 — Server Components se DB directly server pe query, kam JS client pe
- **Prisma 7** + PostgreSQL — type-safe DB, generated client `src/generated/prisma` me custom output pe
- **Clerk** (`@clerk/nextjs`) — auth, org, MFA. Khud auth banane ka time bachaya
- **TanStack React Query** — server state, caching, invalidation
- **Redux Toolkit** — sirf client-side UI state (folders/workspaces list, optimistic UI)
- **Tailwind v4 + Radix UI (shadcn)** — design system
- **Zod + react-hook-form** — form validation
- **Nodemailer** — invite emails, first-view notification
- **Stripe** — subscription checkout (PRO plan)
- **Cloudinary** — video CDN

**Desktop (`vync-desktop`)** — Electron 30, Vite 5, React 18, `socket.io-client`, `@clerk/clerk-react`, `electron-updater` (auto-update), `electron-builder` (packaging)

**Express (`vync-express`)** — Express 5, Socket.io 4, `@google/genai`, `cloudinary`, `axios`

### Interview trap: "Redux aur React Query dono kyun?"
> "Do alag cheezein hain. React Query **server state** handle karta hai — fetching, caching, invalidation, `getWorkspaceFolders` jaise server actions ka result. Redux sirf **client UI state** rakhta hai — jaise sidebar me current folders list jise main optimistically update karta hoon jab naya folder banta hai, taaki UI turant react kare bina refetch ke."

---

## Chapter 3 — Database Design (Prisma Schema)

File: `Vync first/prisma/schema.prisma`

### 9 Models

```
User ──1:1──> Media (studio settings)
     ──1:1──> Subscription (FREE | PRO)
     ──1:N──> WorkSpace ──1:N──> Folder ──1:N──> Video
     ──1:N──> Video
     ──1:N──> Comment (self-referencing → replies)
     ──1:N──> Notification
     ──1:N──> Invite (sender + reciever, do alag relations)
     ──1:N──> Member (workspace membership)
```

### Key design decisions (ye samjho, ratto mat)

1. **`clerkid` unique field** — Clerk ka user ID aur hamara internal UUID alag hain. Isse auth provider swap karna possible rehta hai; internal relations kabhi Clerk pe depend nahi karte.
2. **`Video.source` `@unique`** — Ye **sabse important trick** hai. Recording start hone pe `source` = filename (`uuid-xxxx.webm`). Express jab complete karta hai to same row ko `where: { userId, source: filename }` se dhoondh ke `source` ko Cloudinary URL se replace kar deta hai. Yaani filename ek **temporary correlation key** hai jo baad me permanent URL ban jaata hai. Isliye unique hona zaroori hai.
3. **`processing: Boolean @default(true)`** — Video row recording ke waqt hi ban jaati hai `processing=true` ke saath, taaki dashboard pe turant "Processing..." card dikhe. Express `/complete` call karke `false` karta hai.
4. **Self-referencing Comment** — `reply Comment[] @relation("reply")` + `Comment Comment?` — ek hi table me nested threaded replies.
5. **Do named relations on Invite** — `@relation("sender")` aur `@relation("reciever")` — dono User pe point karte hain, isliye Prisma ko naam chahiye.
6. **`summery` (typo)** — is field me **transcript** JSON store hota hai (naam misleading hai — honestly bata dena, "legacy naming, refactor pending" bol dena).
7. **`onDelete: Cascade`** — Video, Comment pe — user/workspace delete hone pe orphan rows na rahein.

### Enums
`Type { PERSONAL, PUBLIC }` · `PRESET { HD, SD }` · `SUBSCRIPTION_PLAN { FREE, PRO }`

### "Migrations kaise handle kiye?"
> "`prisma db push` development me schema sync ke liye, aur build step me `prisma generate` (`"build": "prisma generate && next build"`) — Vercel pe har build me fresh client generate hota hai. Client output custom path `src/generated/prisma` pe hai."

---

## Chapter 4 — Authentication Flow (Clerk + Lazy User Sync)

### Do entry points, ek hi pattern

**A) Web pe** — `src/actions/user.ts` → `onAuthenticateUser()`
```
currentUser() (Clerk) → nahi mila to 403
  → DB me clerkid se dhoondo
    → mil gaya  → { status: 200, user }
    → nahi mila → create karo, aur SAATH ME nested create:
         studio: {}          (default Media row)
         subscription: {}    (default FREE plan)
         workspace: { name: "<FirstName>'s Workspace", type: PERSONAL }
      → { status: 201, user }
```

**B) Desktop se** — `src/app/api/auth/[id]/route.ts` (GET) — bilkul wahi logic, but Clerk ID URL param se aata hai aur `clerkClient().users.getUser(id)` se profile fetch hota hai.

### Ye pattern ka naam: **Lazy / Just-in-time user provisioning**
> "Maine Clerk webhooks use nahi kiye. Jab user pehli baar app touch karta hai tabhi DB row banti hai. Fayda — webhook delivery failure ka koi risk nahi, aur ek hi atomic `create` me user + studio + subscription + personal workspace sab ban jaate hain. Nuksaan — har request pe ek extra `findUnique`; production scale pe main ise Clerk webhook + cache se replace karta."

### Middleware — `src/proxy.ts`
```ts
clerkMiddleware(async (auth, req) => {
  // 1. CORS preflight (OPTIONS) handle — desktop app :5173 se aata hai
  // 2. isProtectedRoutes = ['/dashboard(.*)', '/payment(.*)']
  //    session.userId nahi → redirect /auth/sign-in
  // 3. Allowed origins pe CORS headers set
})
```
- `allowedOrigins`: `localhost:5173` (Electron renderer), `localhost:3000`, `*.vercel.app`
- **Ye file `proxy.ts` hai, `middleware.ts` nahi** — Next.js 16 me middleware ko `proxy.ts` rename kiya gaya hai (Next 16 ka naya convention).
- Recent commit `cc8dbb8` me maine `auth().protect()` ki jagah explicit `NextResponse.redirect('/auth/sign-in')` kiya — kyunki `protect()` desktop-origin requests pe clean redirect nahi de raha tha.

---

## Chapter 5 — Desktop App: Electron Architecture

File: `vync-desktop/electron/main.ts`

### 3 BrowserWindows (ye poora yaad rakho)

| Window | Size | Kaam | Entry HTML |
|---|---|---|---|
| `win` | 500×400 | Main widget — login + media source config | `index.html` |
| `studio` | 400×250 | Floating recording tray (record/stop/timer/preview) | `studio.html` |
| `floatingWebCam` | 200×200 | Circular webcam overlay | `webcam.html` |

Sab windows: `frame: false`, `transparent: true`, `alwaysOnTop: true`
`studio` aur `webcam`: `focusable: false` → recording ke waqt user ka focus steal nahi karte
`studio` aur `webcam`: `show: false` → sirf tab dikhte hain jab source select ho jaaye

```ts
win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
win.setAlwaysOnTop(true, "screen-saver", 1)   // highest z-level
```
→ Isse widget macOS ke fullscreen apps ke upar bhi float karta hai.

### Security posture (ye bolo to impression padta hai)
```ts
webPreferences: {
  nodeIntegration: false,     // renderer me Node access band
  contextIsolation: true,     // renderer aur preload ka context alag
  preload: "preload.mjs"
}
```
`electron/preload.ts` me `contextBridge.exposeInMainWorld('ipcRenderer', { on, off, send, invoke })` — sirf ye 4 methods expose. Renderer kabhi `fs` ya `child_process` touch nahi kar sakta.

### IPC Channels (poori list)

| Channel | Type | Direction | Kaam |
|---|---|---|---|
| `getSources` | `handle`/`invoke` | R→M→R | `desktopCapturer.getSources({types:["window","screen"]})` — screens/windows ki list + thumbnails |
| `media-sources` | `on`/`send` | R→M | Selected source payload → `studio.show()` + `studio.webContents.send("profile-received", payload)` |
| `profile-received` | `send`/`on` | M→R(studio) | Studio tray ko screen id, audio id, userId, preset, plan bhejta hai |
| `resize-studio` | `on`/`send` | R→M | `{shrink: true}` → 400×100, warna 400×250 (preview toggle pe) |
| `hide-plugin` | `on`/`send` | R→M→R(win) | Recording start pe main widget chhupa dena |
| `closeApp` | `on`/`send` | R→M | Saare windows destroy + `app.quit()` + `app.exit(0)` fallback |

### Production me renderer kaise serve hota hai? (ye advanced hai, bolne pe alag dikhoge)
Dev me `VITE_DEV_SERVER_URL` se load hota hai. **Production me `file://` protocol use nahi kiya** — kyunki Clerk auth aur `getUserMedia` ko proper HTTP origin chahiye. Isliye maine `main.ts` me ek chhota `node:http` server likha (`startRendererServer`) jo `dist/` folder ko `http://localhost:5173` pe serve karta hai, MIME types map ke saath, aur ek **path-traversal guard** ke saath:
```ts
if (resolvedPath !== rendererRoot && !resolvedPath.startsWith(rendererRoot + path.sep)) return null  // 403
```
Extension-less path pe SPA shell (`index.html`) fallback deta hai.

### Auto-update
`electron-updater` + `electron-builder` GitHub provider. `update-available` pe dialog, `update-downloaded` pe "Restart Now / Later" prompt → `autoUpdater.quitAndInstall()`.

Aur `app.disableHardwareAcceleration()` — kuch machines pe transparent + always-on-top windows me GPU compositing artifacts aa rahe the.

---

## Chapter 6 — Recording Pipeline (Project Ka Dil ❤️ — sabse zyada poochha jayega)

File: `vync-desktop/src/lib/recorder.ts` + `src/components/Global/StudioTray/index.tsx`

### Step-by-step flow

**1. Source selection — `selectSources()`**
```ts
const constraints = {
  audio: false,
  video: {
    mandatory: {
      chromeMediaSource: "desktop",
      chromeMediaSourceId: onSources.screen,   // desktopCapturer se aaya id
      minWidth/maxWidth:  preset === "HD" ? 1920 : 1280,
      minHeight/maxHeight: preset === "HD" ? 1080 : 720,
      frameRate: 30,
    }
  }
}
const screenStream = await navigator.mediaDevices.getUserMedia(constraints)
```
> `chromeMediaSource: "desktop"` ye Chromium-specific legacy constraint hai — isi se Electron me screen capture milta hai.

**2. Audio — 2-level graceful fallback**
```
Selected mic (deviceId exact) → fail?
  → default mic (audio: true) → fail?
    → warn karo, screen-only continue karo (crash nahi)
```

**3. Stream merge**
```ts
const currentStream = new MediaStream([
  ...screenStream.getVideoTracks(),
  ...(audioStream ? audioStream.getAudioTracks() : [])
])
```

**4. Codec negotiation**
```ts
["video/webm; codecs=vp8,opus", "video/webm; codecs=vp8", "video/webm"]
  → pehla jo MediaRecorder.isTypeSupported() true de, wahi use
```
> "Hardcode nahi kiya kyunki Electron version / platform ke hisaab se codec support alag hota hai."

**5. Start — `StartRecording()`**
```ts
hidePluginWindow(true)                                     // widget chhupao
videoTransferFileName = `${uuid()}-${id.slice(0,8)}.webm`   // unique filename
mediaRecorder.start(1000)                                  // har 1 second pe chunk
```

**6. Har chunk — `onDataAvailable()`**
```ts
socket.emit("video-chunks", { chunks: e.data, filename: videoTransferFileName })
```

**7. Stop — `mediaRecorder.onstop`**
```ts
socket.emit("process-video", { filename, userId })
```

### FREE plan ka 5-minute limit
`StudioTray/index.tsx` me timer `setInterval` har second chalta hai:
```ts
if (onSources?.plan === "FREE" && recordingTime.minute === "05") stopRecording()
```
Timer `startTimeRef = Date.now()` se **elapsed time calculate** karta hai, counter increment se nahi — kyunki `setInterval` drift karta hai aur 5 min ka limit galat trigger hota.

### Interview Q: "1 second ka chunk interval kyun?"
> "Trade-off hai. Chhota interval = zyada socket overhead but crash pe kam data loss aur upload recording ke saath-saath parallel ho jaata hai. Bada interval = kam overhead but stop ke baad lamba wait. 1 second pe upload effectively recording ke saath complete ho jaata hai — user ko stop karte hi video ready milti hai, ye hi hamara 'instant share' USP hai."

### Interview Q: "Recording ke beech me internet chala jaaye to?"
> "Abhi Socket.io khud reconnect karta hai aur server-side stream map **global** hai (per-socket nahi), isliye reconnect ke baad bhe same filename pe append continue hota hai — ye maine specifically fix kiya tha. Lekin disconnect ke दौरान ke chunks abhi drop ho jaate hain. Next step: renderer me chunks ko IndexedDB me buffer karna aur `socket.on('connect')` pe replay karna."

---

## Chapter 7 — Express Media Server (Ingestion + AI Orchestration)

File: `vync-express/server.js`

### Boot-time guard
```js
if (!process.env.INTERNAL_SERVER_SECRET) { console.error("FATAL"); process.exit(1) }
```
> "Fail fast — missing secret pe server chalu hi nahi hota, warna production me pata chalta jab Next.js 401 dene lagta."

### `socket.on("video-chunks")` — Ordered append

```js
const activeUploadStreams = new Map()   // GLOBAL, connection ke bahar

let writeStream = activeUploadStreams.get(data.filename)
if (!writeStream) {
  writeStream = fs.createWriteStream(filePath, { flags: "a" })   // append
  activeUploadStreams.set(data.filename, writeStream)
}
writeStream.write(Buffer.from(data.chunks), errCallback)
```

**Do critical fixes jo maine kiye (ye zaroor bolna):**
1. **Map global hai, `io.on("connection")` ke andar nahi** — warna user disconnect/reconnect pe naya stream banta aur file corrupt hoti.
2. **Node ka WriteStream internally queue karta hai** — isliye chunks disk pe hamesha chronological order me likhe jaate hain, chahe `write()` calls kitni bhi fast aayein. Ye hi order guarantee ka mechanism hai.

### `socket.on("process-video")` — 6-step orchestration

```
1. Stream ko SAFELY band karo:
   await new Promise(resolve => writeStream.end(resolve))
   activeUploadStreams.delete(filename)
   ↑ Ye FIX #1 tha — pehle bina await ke read kar raha tha
     aur half-flushed file Gemini ko ja rahi thi

2. POST /api/recording/{userId}/processing  (Bearer INTERNAL_SERVER_SECRET)
   → Next.js DB me Video row banata hai (processing: true)
   → Response me user ka plan (FREE/PRO) return karta hai

3. Cloudinary upload (agar real creds hain):
   cloudinary.uploader.upload_stream({ resource_type:"video", folder:"vync",
                                       public_id: filename, chunk_size: 6_000_000 })
   fs.createReadStream(filePath).pipe(uploadStream)
   → fail ho jaaye? catch karke LOCAL Express URL pe fallback:
     http://localhost:5001/videos/{filename}   (express.static se serve)

4. Agar plan === "PRO" → Gemini AI pipeline (neeche Chapter 8)

5. POST /api/recording/{userId}/complete
   → processing: false, source: videoUrl (Cloudinary URL se filename replace)

6. finally: agar Cloudinary pe chala gaya → local temp file delete
```

### Interview Q: "Cloudinary fail ho gaya to?"
> "Try/catch ke andar hai aur `videoUrl` default se local Express URL pe set hai. Cloudinary fail ho to warn karke local hosting pe fall back kar jaata hai — video kabhi lost nahi hota. Aur `finally` block me delete tabhi hota hai jab `isCloudinary === true` ho."
>
> *(Honest note: `isCloudinary` `try` block me declare hai aur `finally` me use hota hai — ye ek scoping bug hai jo `finally` me ReferenceError de sakta hai. Agar interviewer pakde to: "Haan, ye known issue hai — variable ko `try` ke bahar hoist karna hai.")*

### `express.static` se streaming
```js
app.use("/videos", express.static(path.join(__dirname, "temp_upload")))
```
Express static automatically **HTTP Range requests** (`Accept-Ranges: bytes`) support karta hai → video player me seeking kaam karti hai bina poori file download kiye.

---

## Chapter 8 — AI Layer (Google Gemini) — Do Alag Pipelines

### Pipeline A — Automatic (Express, PRO users only) — `server.js`

```js
1. ai.files.upload({ file: filePath, mimeType: "video/webm" })

2. POLLING LOOP:
   while (fileStatus.state === "PROCESSING" && retries < 60) {
     await sleep(2000)
     fileStatus = await ai.files.get({ name: uploadedFile.name })
   }
   → max 60 retries × 2s = 2 minute timeout
   → state === "FAILED" → throw

3. ai.models.generateContent({
     model: "gemini-2.5-flash",
     contents: [ { fileData: { fileUri, mimeType } }, { text: prompt } ],
     config: { responseMimeType: "application/json" }   // ← structured output
   })

4. Prompt maangta hai: { transcript, title, summary }

5. POST /api/recording/{userId}/transcribe  → DB update
6. ai.files.delete({ name })  → Gemini storage cleanup
```

**Poora Gemini block ek `try/catch` me hai** — AI fail ho to `console.log("Continuing video upload without AI...")` aur video normally complete ho jaati hai. **AI failure kabhi upload block nahi karta.** Ye design decision zaroor bolo.

**Key points:**
- `gemini-2.5-flash` chuna — speed + cost, aur native **multimodal video** understanding (audio + visual dono)
- `responseMimeType: "application/json"` — model ko JSON mode me force karta hai, brittle regex parsing se bachata hai
- Polling zaroori hai kyunki video upload ke turant baad Gemini pe usable nahi hoti

### Pipeline B — On-demand (Next.js Server Action) — `actions/workspace.ts` → `generateAiVideoSummary(videoId)`

Ye dashboard ka **"Generate AI Summary" button** hai:
- Direct `fetch` to `generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`
- Prompt structured markdown maangta hai: `### 📌 Executive Overview`, `### 🚀 Key Highlights`, `### ⚙️ Technical Context`, `### 🎯 Summary & Next Steps`
- Plus `transcript: [{time, text}]` array
- **Defensive parsing:** ` ```json ` fences strip karta hai, `parsed.description || parsed.summary` fallback, transcript array/string dono handle karta hai, har item pe `item.time || item.timestamp || generated` fallback
- **Graceful degradation:** agar `GEMINI_API_KEY` missing hai ya call fail ho — ek pre-written high-quality fallback summary aur transcript DB me chala jaata hai, taaki demo/UI kabhi khaali na dikhe

> **Agar interviewer poochhe "ye hardcoded fallback kyun?"** → Honest jawab: "Demo resilience ke liye. API key na ho ya quota khatam ho to UI empty state me nahi girta. Production me main ise 'AI unavailable, retry' state se replace karta — abhi ye deliberately optimistic hai."

### Transcript rendering — `components/global/video-transcript/index.tsx`
`parseTranscript()` ek **3-level tolerant parser** hai:
1. JSON array parse → objects (`time`/`timestamp`/`ts`, `text`/`content`/`summary`/`message`)
2. Nested `{transcript: [...]}` ya `{segments: [...]}` → recurse
3. JSON fail → line-by-line parse, har line se `[00:00]` pattern extract

> "Maine ye isliye likha kyunki LLM output shape kabhi 100% guaranteed nahi hoti. Parser 3 alag formats tolerate karta hai instead of crash karne ke."

---

## Chapter 9 — Data Flow: Ek Recording Ka Poora Safar (End-to-End)

**Ye diagram board pe bana ke samjhana — interview jeet jaoge:**

```
[1] Electron widget → getSources IPC → desktopCapturer → screens list
[2] User selects screen + mic + preset
[3] POST /api/studio/{userId} → Media table update (screen, mic, preset)
[4] "Record" click
       ↓
[5] getUserMedia (desktop constraints) → MediaRecorder.start(1000)
       ↓  har 1 second
[6] socket.emit("video-chunks") ──WebSocket──> Express
       ↓                                         ↓
       ↓                              fs.createWriteStream(append)
       ↓                              temp_upload/{uuid}.webm
[7] "Stop" click → socket.emit("process-video")
       ↓
[8] Express: await writeStream.end()
       ↓
[9] Express ──POST /processing (Bearer secret)──> Next.js
       ↓                                            ↓
       ↓                        Video row CREATE (processing: true,
       ↓                        source = filename) → returns plan
       ↓
[10] Cloudinary upload (stream) → secure_url
       │  (fail → local http://localhost:5001/videos/... fallback)
       ↓
[11] IF plan === PRO:
       Gemini files.upload → poll (max 2min) → generateContent
       → POST /transcribe → title, description, summery(=transcript) save
       → files.delete (cleanup)
       ↓
[12] Express ──POST /complete──> Next.js
       → processing: false, source = Cloudinary URL   ← unique filename se row milti hai
       ↓
[13] Local temp file deleted (agar Cloudinary succeed hua)
       ↓
[14] Web dashboard: React Query refetch → video card live
       ↓
[15] /preview/{videoId} → sharable link, timestamped comments, AI tabs
```

---

## Chapter 10 — Web App Structure (Next.js App Router)

```
src/app/
├── (website)/           → public landing page (route group, URL me nahi aata)
├── auth/
│   ├── sign-in/[[...sign-in]]/    → Clerk catch-all route
│   ├── sign-up/[[...sign-up]]/
│   └── callback/                  → post-auth → onAuthenticateUser() → redirect dashboard
├── dashboard/[workspaceId]/
│   ├── home/           ├── video/[videoId]/   ├── folder/[folderId]/
│   ├── settings/       ├── notifications/     └── billing/
├── preview/[videoId]/  → PUBLIC sharable video page
├── invite/[inviteId]/  → invite accept page
└── api/
    ├── auth/[id]        (GET)   → desktop app user fetch/create
    ├── studio/[id]      (POST)  → media settings save
    ├── payment/         (GET)   → Stripe checkout session
    └── recording/[id]/
        ├── processing/  (POST)  → video row create
        ├── transcribe/  (POST)  → AI data save
        └── complete/    (POST)  → processing done + URL swap
```

### Server Components + React Query hydration pattern
`preview/[videoId]/page.tsx` isko perfectly dikhata hai:
```tsx
const query = new QueryClient()
await query.prefetchQuery({ queryKey:["preview-video"],  queryFn: () => getPreviewVideo(videoId) })
await query.prefetchQuery({ queryKey:["user-profile"],   queryFn: getUserProfile })
await query.prefetchQuery({ queryKey:["video-comments"], queryFn: () => getVideoComments(videoId) })

return <HydrationBoundary state={dehydrate(query)}><VideoPreview videoId={videoId}/></HydrationBoundary>
```
> "Server pe data prefetch hota hai (SEO + fast first paint), dehydrate hoke client pe jaata hai, aur client component `useQueryData` se **bina koi extra network request kiye** wahi cached data padhta hai. Uske baad refetch/invalidation client pe React Query handle karta hai. Best of both worlds."

### Custom hooks (reusable abstraction layer)
| Hook | Kaam |
|---|---|
| `useQueryData(key, fn, enabled)` | `useQuery` ka thin wrapper — consistent API |
| `useMutationData(key, fn, queryKey, onSuccess)` | mutation + **automatic `sonner` toast** + `onSettled` pe `invalidateQueries` |
| `useMutationDataState(key)` | `useMutationState` se pending variables — **optimistic UI** ke liye (naya folder turant dikh jaata hai) |
| `useZodForm` | react-hook-form + zodResolver |
| `useCreateFolders`, `useCreateWorkspace`, `useEditVideo`, `useSearch`, `useVideo`, `useSubscription`, `useFolders` | feature-specific |

> "Maine `useMutationData` isliye banaya kyunki har mutation me wahi 3 cheezein repeat ho rahi thi — toast, cache invalidation, pending state. Ek jagah abstract kar diya, ab har feature 3 lines me mutation kar leta hai."

---

## Chapter 11 — Server Actions (Business Logic Layer)

`"use server"` — ye functions **sirf server pe** chalte hain, client se direct call hote hain (koi API route likhne ki zarurat nahi).

### `src/actions/user.ts` (12 functions)
`sendEmail` · `onAuthenticateUser` · `getNotifications` · `searchUsers` · `getPaymentInfo` · `enableFirstView` · `getFirstView` · `createCommentAndReply` · `getUserProfile` · `getVideoComments` · `inviteMembers` · `acceptInvite`

### `src/actions/workspace.ts` (15 functions)
`verifyAccessToWorkspace` · `getWorkspaceFolders` · `getAllUserVideos` · `getWorkSpaces` · `createWorkspace` · `renameFolders` · `createFolder` · `getFolderInfo` · `moveVideoLocation` · `getPreviewVideo` · `sendEmailForFirstView` · `editVideoInfo` · `deleteVideo` · `howToPost` · `generateAiVideoSummary`

### Highlight karne layak 4 functions

**1. `verifyAccessToWorkspace` — Authorization**
```ts
client.workSpace.findUnique({
  where: {
    id: workspaceId,
    OR: [
      { User: { clerkid: user.id } },                       // owner
      { members: { some: { User: { clerkid: user.id } } } } // member
    ]
  }
})
```
> "Authorization DB query me hi baked hai — owner ya member dono ko access. Agar match nahi hua to `null` return hota hai, alag se permission check likhne ki zarurat nahi."

**2. `createCommentAndReply` — Ek function, do kaam**
`commentId` diya hai → existing comment pe nested `reply` create; nahi diya → top-level comment. Self-referencing relation isi ko support karta hai.

**3. `inviteMembers` — 4 side-effects ek flow me**
```
Invite row create
  → sender ko notification ("You invited X to W")
  → receiver ko notification with link /invite/{id}
  → Nodemailer se HTML email with "Accept Invite" button
```
`acceptInvite` me **do security checks**: `user.id !== invitation.reciever.clerkid` → 401, aur `member.findFirst` se duplicate membership prevent.

**4. `sendEmailForFirstView` — Product touch**
Agar user ne `firstView` setting on ki hai aur video ke `views === 0` hain → views increment + "Your video just got its first viewer" email + in-app notification. Ye Loom ka signature feature hai.

**5. `getPreviewVideo` — `author` flag**
```ts
author: user.id === video.User?.clerkid
```
> "Server hi decide karta hai ki viewer owner hai ya nahi. Isse client pe edit/delete buttons conditionally render hote hain — trust client pe nahi daala."

---

## Chapter 12 — Security (ye chapter tumhe alag league me daal dega)

### 1. Internal service-to-service auth
Express aur Next.js ke beech ke 3 endpoints (`/processing`, `/transcribe`, `/complete`) **shared secret** se protect hain:
```js
// Express bhejta hai
headers: { Authorization: `Bearer ${process.env.INTERNAL_SERVER_SECRET}` }

// Next.js check karta hai
if (authHeader !== `Bearer ${process.env.INTERNAL_SERVER_SECRET}`)
  return NextResponse.json({ error: "Unauthorized Service" }, { status: 401 })
```
> "Ye endpoints Clerk session se protect nahi ho sakte kyunki caller ek server hai, user nahi. Isliye shared-secret bearer token. Bina iske koi bhi POST karke fake video rows bana sakta tha ya kisi ka bhi transcript overwrite kar sakta tha."
>
> **Improvement bolna:** "Production me main ise HMAC-signed request (timestamp + body signature) me upgrade karta, taaki replay attacks bhi rukein."

### 2. Electron sandboxing
`nodeIntegration: false` + `contextIsolation: true` + narrow `contextBridge` surface. Renderer compromise ho to bhi Node APIs reachable nahi.

### 3. Path traversal guard
Production renderer server me resolved path ko `RENDERER_DIST` ke andar hona verify karta hai, warna 403.

### 4. Middleware layer
Route matcher `/dashboard(.*)`, `/payment(.*)` pe session check + explicit sign-in redirect. CORS whitelist (`localhost:5173`, `localhost:3000`, `*.vercel.app`).

### 5. Authorization in queries
`verifyAccessToWorkspace`, `getPreviewVideo`'s `author` flag, `acceptInvite`'s clerkid match — sab server-side.

### Known weaknesses (khud bata dena — ye maturity dikhata hai)
- Socket.io connections authenticated nahi hain — koi bhi connect karke chunks bhej sakta hai. **Fix: socket handshake me Clerk JWT verify.**
- `/preview/{videoId}` pe `currentUser()` required hai, to "public share link" abhi truly public nahi hai — ye conscious trade-off tha.
- Stripe route abhi placeholder hai (`new Stripe("abv")`, `priceId = "cc"`) — billing UI ban chuka hai, real keys wire karna baaki hai. **Agar poochhe to seedha bol dena — jhooth mat bolna.**

---

## Chapter 13 — Challenges & Solutions (STAR format me ratt lo)

### Challenge 1: Chunks ka order aur file corruption
**S:** MediaRecorder har 1s pe blob emit karta hai, socket pe async pahunchte hain.
**T:** Disk pe chronological order guarantee karna.
**A:** Per-filename ek persistent `fs.createWriteStream` (append mode) ek **global** Map me. Node ka write stream internally writes ko queue karta hai. Map global rakha taaki reconnect pe same stream mile.
**R:** Zero corrupted files, disconnect-resilient.

### Challenge 2: Half-written file Gemini ko ja rahi thi
**S:** `process-video` pe turant `fs.existsSync` + read kar raha tha, but buffer abhi flush nahi hua tha.
**T:** Read se pehle guaranteed flush.
**A:** `await new Promise(resolve => writeStream.end(resolve))` — callback-based end ko promisify kiya, phir Map se delete.
**R:** Truncated video / corrupt Gemini uploads khatam.

### Challenge 3: Local filename se permanent URL tak mapping
**S:** Video row recording ke waqt banti hai (UI me "processing" dikhane ke liye), but final URL 30-60 second baad milta hai.
**T:** Correlation without race conditions.
**A:** `Video.source` ko `@unique` banaya. Pehle filename store, phir `where: {userId, source: filename}` se dhoondh ke Cloudinary URL se overwrite.
**R:** Ek hi column dono kaam karta hai, koi extra join table nahi.

### Challenge 4: Electron production build me auth toot raha tha
**S:** `file://` protocol pe Clerk aur `getUserMedia` origin-based security ki wajah se fail.
**T:** Packaged app me proper origin chahiye.
**A:** Main process me ek minimal `node:http` static server jo `dist/` ko `http://localhost:5173` pe serve karta hai, MIME map + SPA fallback + path traversal guard ke saath.
**R:** Dev aur production behaviour identical.

### Challenge 5: AI failure poori upload rok deti thi
**S:** Gemini timeout/quota error se `process-video` handler crash, video kabhi complete hi nahi hoti thi.
**T:** AI ko optional banao.
**A:** Poora Gemini block isolated try/catch me; failure pe log karke pipeline continue. Plus 60-retry timeout guard.
**R:** AI down ho to bhi core product (record + share) 100% kaam karta hai — **graceful degradation**.

### Challenge 6: Recording ke waqt widget beech me aa raha tha
**A:** `hidePluginWindow` IPC + `focusable: false` windows + `alwaysOnTop("screen-saver", 1)` + `setVisibleOnAllWorkspaces` — recording me widget capture nahi hota aur user ka focus steal nahi karta.

---

## Chapter 14 — Rapid-Fire Interview Q&A

**Q: Loom se different kya hai?**
> Do cheezein — (1) Zero-wait sharing: chunks recording ke saath hi upload ho rahe hote hain, stop karte hi link ready. (2) Gemini se structured video intelligence — sirf transcript nahi, executive overview + key highlights + technical context + next steps, aur clickable `[00:00]` timestamps.

**Q: WebSocket kyun, plain HTTP upload kyun nahi?**
> Chunked recording ek continuous stream hai. HTTP se har second ek naya request = connection overhead, ordering complexity, aur server pe har request pe file reopen. WebSocket ek persistent connection deta hai jispe main server-side ek hi open write stream maintain karta hoon. Plus bidirectional — server `upload-error` events wapas bhej sakta hai.

**Q: Scale karna ho to kya badlega?** (ye zaroor poochhenge)
> 1. **Local disk hatana** — chunks seedha S3 multipart upload pe, taaki Express stateless ho aur horizontally scale kare
> 2. **Socket.io Redis adapter** — multiple Express instances ke beech sticky sessions
> 3. **AI ko queue me daalna** — BullMQ/SQS worker, taaki Gemini ka 2-minute polling request thread block na kare
> 4. **DB indexes** — `Video(workSpaceId, createdAt)`, `Video(userId)`, `Comment(videoId)`
> 5. **Signed CDN URLs** — abhi Cloudinary URLs public hain
> 6. **Socket authentication** — handshake me Clerk JWT

**Q: Testing?**
> Abhi manual/integration testing hai — automated suite gap hai aur main ye maanta hoon. Priority order jo main likhta: `parseTranscript` ke unit tests (sabse zyada edge cases), `/recording/*` routes ke integration tests with mocked Prisma, aur Playwright se ek E2E — record se preview tak.

**Q: `summery` field me transcript kyun?**
> Legacy naming — initially summary ke liye tha, baad me transcript wahan store karne laga aur summary `description` me chali gayi. Ye tech debt hai, migration se rename karna chahiye. (Honestly bolo — interviewer isse maturity samajhta hai.)

**Q: Server Actions vs API Routes — kab kya?**
> Server Actions: jab caller mera apna Next.js UI ho — type-safe, no boilerplate, direct call. API Routes: jab caller external ho — Electron desktop app (`/api/auth/[id]`, `/api/studio/[id]`) aur Express server (`/api/recording/*`). Unhe HTTP contract chahiye, Server Action ka RPC protocol nahi.

**Q: Environment variables kya kya hain?**
> **Next.js:** `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `GEMINI_API_KEY`, `NEXT_PUBLIC_HOST_URL`, `INTERNAL_SERVER_SECRET`, `MAILER_EMAIL`, `MAILER_PASSWORD`, `CLOUD_WAYS_POST`
> **Express:** `INTERNAL_SERVER_SECRET`, `NEXT_API_HOST`, `GEMINI_API_KEY`, `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`, `PORT`
> **Desktop:** `VITE_HOST_URL`, `VITE_SOCKET_URL`, `VITE_APP_URL`

**Q: Deployment?**
> Next.js → Vercel (root directory `Vync first`, build me `prisma generate`). PostgreSQL → Neon/Supabase. Express → koi bhi persistent-process host (Railway/Render/VPS) — Vercel pe nahi ja sakta kyunki WebSocket + disk chahiye. Desktop → `electron-builder` se macOS (arm64) aur Windows (NSIS) builds, GitHub releases se auto-update.

**Q: Sabse zyada proud kis cheez pe ho?**
> Resilience layers pe. Har external dependency ka fallback hai — audio device fail ho to default mic, wo bhi fail ho to screen-only. Cloudinary fail ho to local Express hosting. Gemini fail ho to video normally complete. Codec support na ho to negotiate karke agla try. Ek bhi external service down ho, core product record-and-share kabhi nahi tootta.

---

## Chapter 15 — Cheat Sheet (interview se 10 min pehle padho)

| Cheez | Number/Value |
|---|---|
| Apps | 3 (Next.js :3000, Express :5001, Electron :5173) |
| DB models | 9 — User, Media, Subscription, WorkSpace, Folder, Video, Member, Notification, Invite |
| Chunk interval | 1000ms |
| Resolutions | HD 1920×1080 (PRO) / SD 1280×720 (FREE), 30fps |
| Codec | `video/webm; codecs=vp8,opus` (negotiated) |
| FREE limit | 5 minutes auto-stop |
| Gemini model | `gemini-2.5-flash` (Express) / `gemini-flash-latest` (Server Action) |
| Gemini polling | 60 retries × 2s = 2 min timeout |
| Cloudinary chunk_size | 6 MB |
| Electron windows | 3 — main widget, studio tray, floating webcam |
| IPC channels | 6 — getSources, media-sources, profile-received, resize-studio, hide-plugin, closeApp |
| Internal API routes | `/processing`, `/transcribe`, `/complete` (Bearer secret) |
| Server actions | 27 total (12 user + 15 workspace) |

### Ek breath me poora flow (ratt lo)
> "Electron widget `desktopCapturer` se screen sources leta hai, user select karta hai, settings `/api/studio` pe save hoti hain. Record pe `getUserMedia` desktop constraints ke saath stream leta hai, screen + mic tracks merge karke MediaRecorder 1-second chunks banata hai jo Socket.io pe Express ko jaate hain. Express per-file ek append write stream me ordered likhta hai. Stop pe stream close hota hai, Next.js pe `/processing` hit karke Video row banti hai aur plan wapas aata hai, file Cloudinary pe stream hoti hai, PRO ho to Gemini video analyze karke JSON me transcript-title-summary deta hai jo `/transcribe` pe save hota hai, aur `/complete` processing false karke source ko permanent URL se replace kar deta hai. Web dashboard React Query se refetch karke video live dikha deta hai, jahan se sharable preview link, timestamped comments aur AI tabs milte hain."

---

## Chapter 16 — Confidence Rules

1. **"Maine" bolo, "isme" nahi** — "Maine global stream map isliye rakha kyunki..." not "isme ek map hai"
2. **Har decision ka trade-off bolo** — sirf *kya* nahi, *kyun* aur *kya nuksaan tha*
3. **Weaknesses khud batao** — socket auth missing, Stripe placeholder, tests nahi, `summery` naming. Jo khud admit karta hai, wo owner lagta hai.
4. **Numbers bolo** — "1 second chunks", "60 retries", "6MB chunk size", "5 minute FREE limit"
5. **Kuch na pata ho to:** "Wo part maine [X] library pe chhoda tha, exact internals abhi yaad nahi — but mera mental model ye hai ki..." — kabhi bluff mat karo
6. **Diagram maango** — "Main whiteboard pe flow bana ke dikhaun?" — instant credibility
