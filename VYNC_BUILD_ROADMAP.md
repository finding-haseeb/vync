# Vync — Agar Bilkul Zero Se Banata To Kaise Start Karta

> Ye **build order** hai, feature list nahi.
> Golden rule: **Sabse risky cheez pehle banao, UI sabse last me.**
> Har phase ke end me ek "PROOF" hai — jab tak wo pass na ho, agle phase pe mat jao.

---

## Pehle Ye Samjho: Order Kyun Matter Karta Hai

Zyadatar log aisa start karte hain:
```
❌ Landing page → Login page → Dashboard UI → ...phir socha "ab recording kaise karein?"
   → pata chala Electron chahiye → 2 hafte ka UI bekaar
```

Sahi tareeka:
```
✅ Sabse bada UNKNOWN pehle solve karo:
   "Kya main screen capture karke server pe ek playable file bana sakta hoon?"
   Ye ek baar prove ho gaya → baaki sab standard CRUD hai
```

**Interview me ye line bolna:**
> "Maine risk-first approach liya. Project ka sabse uncertain part tha — Electron se screen capture karke chunks ko server pe ordered append karna. Maine wo pehle 2 din me raw JS me prove kiya, bina kisi auth ya DB ke. Jab wo playable file ban gayi, tab mujhe confidence tha ki baaki 80% standard full-stack kaam hai."

---

## PHASE 0 — Problem Define (Code likhne se pehle, 1 ghanta)

Kagaz pe 3 sawaal likho:

**1. Ek line me product kya hai?**
> "Screen record karo, link mile, AI summary bhi mile."

**2. Core loop kya hai?** (jo cheez na chale to product hi nahi bacha)
> Record → Upload → Share link

**3. Sabse mushkil technical question kya hai?**
> "Browser se poori screen record nahi hoti. To karunga kaise?"
> Answer: Electron ka `desktopCapturer`
> → **Yahi Phase 1 hai.**

**Kya NAHI banana (v1 me):** folders, workspaces, comments, invites, payments, AI, dark mode, landing page. Sab baad me.

---

## PHASE 1 — Spike: Screen Capture (Din 1–2)

**Goal:** Ek Electron window jo screen record kare aur local file save kare. **Koi React nahi, koi server nahi, koi auth nahi.**

### Steps

```bash
npm create vite@latest vync-desktop -- --template react-ts
cd vync-desktop
npm i -D electron vite-plugin-electron
```

`electron/main.ts` — bas itna:
```ts
import { app, BrowserWindow, ipcMain, desktopCapturer } from "electron"

ipcMain.handle("getSources", async () =>
  await desktopCapturer.getSources({ types: ["window", "screen"] })
)

app.whenReady().then(() => {
  const win = new BrowserWindow({
    webPreferences: { preload: __dirname + "/preload.mjs", contextIsolation: true }
  })
  win.loadURL("http://localhost:5173")
})
```

`electron/preload.ts`:
```ts
import { contextBridge, ipcRenderer } from "electron"
contextBridge.exposeInMainWorld("ipcRenderer", {
  invoke: (ch, ...a) => ipcRenderer.invoke(ch, ...a),
  send:   (ch, ...a) => ipcRenderer.send(ch, ...a),
  on:     (ch, fn)   => ipcRenderer.on(ch, (e, ...a) => fn(e, ...a)),
})
```

`App.tsx` — ek button, ek dropdown:
```tsx
const sources = await window.ipcRenderer.invoke("getSources")
// dropdown me sources.map(s => s.name)

const stream = await navigator.mediaDevices.getUserMedia({
  audio: false,
  video: { mandatory: {
    chromeMediaSource: "desktop",
    chromeMediaSourceId: selectedId,
  }} as any
})

const rec = new MediaRecorder(stream, { mimeType: "video/webm" })
const chunks: Blob[] = []
rec.ondataavailable = e => chunks.push(e.data)
rec.onstop = () => {
  const url = URL.createObjectURL(new Blob(chunks, { type: "video/webm" }))
  // <a href={url} download="test.webm">  ya  <video src={url} />
}
rec.start(1000)
```

### ✅ PROOF 1
Desktop pe `test.webm` file save ho aur VLC me play ho jaaye.

**Yahin do cheezein sikh jaoge jo poore project ki neev hain:**
- `chromeMediaSource: "desktop"` wala magic constraint
- `MediaRecorder.start(1000)` — chunking ka concept

> **Agar ye 2 din me na ho** → project scope chhota karo (browser-tab-only recording, `getDisplayMedia`). Aage mat badho.

---

## PHASE 2 — Spike: Chunks Server Pe Bhejo (Din 3–4)

**Goal:** Chunks socket pe server ko jaayein, server disk pe file banaye jo playable ho.

**Ye project ka sabse critical spike hai.** Yahin `activeUploadStreams` wala pattern paida hoga.

```bash
mkdir vync-express && cd vync-express
npm i express socket.io cors
```

`server.js` — pehla version, 30 lines:
```js
const io = new Server(server, { cors: { origin: "*" } })
const streams = new Map()   // ← GLOBAL, io.on ke BAHAR

io.on("connection", socket => {
  socket.on("video-chunks", data => {
    let ws = streams.get(data.filename)
    if (!ws) {
      ws = fs.createWriteStream(`./temp_upload/${data.filename}`, { flags: "a" })
      streams.set(data.filename, ws)
    }
    ws.write(Buffer.from(data.chunks))
  })

  socket.on("process-video", async data => {
    const ws = streams.get(data.filename)
    if (ws) {
      await new Promise(r => ws.end(r))     // ← ye await CRITICAL hai
      streams.delete(data.filename)
    }
    console.log("✅ File ready:", data.filename)
  })
})

app.use("/videos", express.static("./temp_upload"))   // playback ke liye
```

Desktop side me `chunks.push()` ki jagah:
```ts
rec.ondataavailable = e => socket.emit("video-chunks", { chunks: e.data, filename })
rec.onstop          = () => socket.emit("process-video", { filename })
```

### Yahan 3 bugs milenge — aur yahi tumhari interview stories hain

| Bug | Symptom | Fix |
|---|---|---|
| Map `io.on` ke andar tha | Reconnect pe file corrupt | Map ko global scope me nikalo |
| `ws.end()` bina await | Video ka aakhri hissa gayab / corrupt | `await new Promise(r => ws.end(r))` |
| `flags: 'w'` use kiya | Har chunk purane ko overwrite karta hai | `flags: 'a'` (append) |

### ✅ PROOF 2
Browser me `http://localhost:5001/videos/test.webm` kholo — poori video play ho, seek bhi kaam kare.

> **Ab tumhara core loop kaam kar raha hai.** Yahan tak 4 din me pahunch jao. Baaki sab ab "normal" full-stack kaam hai.

---

## PHASE 3 — Next.js + Database (Din 5–7)

Ab web app. **Abhi bhi koi auth nahi** — hardcoded user ID se kaam chalao.

```bash
npx create-next-app@latest "vync-web" --ts --tailwind --app
npm i prisma @prisma/client
npx prisma init --datasource-provider postgresql
```

### Schema pehle version — sirf 2 models
```prisma
model User {
  id      String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email   String  @unique
  clerkid String  @unique
  videos  Video[]
}

model Video {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  title      String?  @default("Untitled Video")
  source     String   @unique      // ← ye @unique yaad rakhna, sabse important
  processing Boolean  @default(true)
  userId     String?  @db.Uuid
  User       User?    @relation(fields: [userId], references: [id])
  createdAt  DateTime @default(now())
}
```

**Yahan wo design decision lo jo poore project ko sambhalta hai:**
> `source` pehle **filename** store karega (`uuid.webm`), baad me **permanent URL** se replace ho jaayega.
> Isliye `@unique` — kyunki Express `where: { source: filename }` se row dhoondhega.
> Aur `processing: true` default — taaki dashboard turant "Processing..." dikha sake.

```bash
npx prisma db push
```

### 2 API routes banao
```
POST /api/recording/[id]/processing  → Video row create (processing: true)
POST /api/recording/[id]/complete    → processing: false, source = final URL
```

### Express ko inse jodo
```js
socket.on("process-video", async data => {
  await closeStream(data.filename)
  await axios.post(`${NEXT_API_HOST}/api/recording/${data.userId}/processing`, { filename: data.filename })
  const videoUrl = `http://localhost:5001/videos/${data.filename}`
  await axios.post(`${NEXT_API_HOST}/api/recording/${data.userId}/complete`, { filename: data.filename, videoUrl })
})
```

### ✅ PROOF 3
Desktop se record karo → Postgres me row dikhe → `processing` `true` se `false` ho → `source` me URL ho.

**Ab pipeline poori hai: Desktop → Express → Next.js → DB.** 🎉

---

## PHASE 4 — Pehla UI (Din 8)

Ab jaake pehla page banao. **Ekdum ugly, bilkul thik hai.**

`app/page.tsx` — server component, 15 lines:
```tsx
const videos = await client.video.findMany({ orderBy: { createdAt: "desc" } })

return videos.map(v =>
  v.processing
    ? <div key={v.id}>⏳ Processing...</div>
    : <video key={v.id} src={v.source} controls width={400} />
)
```

### ✅ PROOF 4
Record karo → page refresh karo → video wahan chal rahi ho.

> **Ye MVP hai. 8 din me.** Ab tak tumne prove kar diya ki product possible hai. Ab layers add karo.

---

## PHASE 5 — Authentication (Din 9–10)

Ab hardcoded user hatao.

```bash
npm i @clerk/nextjs           # web
npm i @clerk/clerk-react      # desktop
```

1. `<ClerkProvider>` root layout me
2. `src/proxy.ts` (Next 16 me middleware ka naam) — `/dashboard(.*)` protect
3. **Lazy user sync** — `onAuthenticateUser()`:
   ```
   currentUser() → DB me clerkid dhoondo
     mila → return
     nahi mila → create karo + nested create: studio{}, subscription{}, workspace{}
   ```
4. Desktop ke liye `GET /api/auth/[id]` — wahi logic, Clerk ID URL se
5. **CORS** — desktop `localhost:5173` se aa raha hai, `proxy.ts` me origin whitelist

> **Yahan phasoge:** desktop app aur web app **alag origins** hain. Clerk ka session cookie share nahi hota. Isliye desktop apna Clerk instance rakhta hai aur Next.js se sirf REST API se baat karta hai — Server Actions se nahi.

### ✅ PROOF 5
Do alag Clerk accounts se login karo — dono ko sirf apni videos dikhein.

---

## PHASE 6 — Organization: Workspaces + Folders (Din 11–13)

Ab schema expand karo:
```
WorkSpace (PERSONAL | PUBLIC) → Folder → Video
Member (workspace membership)
```

- Signup pe automatic `"<Name>'s Workspace"` (PERSONAL) ban jaye
- `/dashboard/[workspaceId]/...` routes
- **`verifyAccessToWorkspace()`** — authorization DB query me hi:
  ```ts
  where: { id: workspaceId, OR: [
    { User: { clerkid: user.id } },                        // owner
    { members: { some: { User: { clerkid: user.id } } } }  // member
  ]}
  ```
- `moveVideoLocation()` — video ko folder me daalna

### Yahan React Query aur Redux introduce karo
- **React Query** — server data (`useQueryData`, `useMutationData` wrappers banao)
- **Redux** — sirf client UI state (sidebar ka folders array, optimistic new-folder card)

> **Ye tab karo jab dard mehsoos ho.** Din 1 se Redux mat daalo — tab tumhe iska *reason* nahi pata hoga aur interview me justify nahi kar paoge.

### ✅ PROOF 6
Folder banao, video usme move karo, refresh karo — sahi jagah pe rahe.

---

## PHASE 7 — Sharing + Comments (Din 14–15)

- `/preview/[videoId]` — public-ish page
- `getPreviewVideo()` me **`author` flag**: `user.id === video.User?.clerkid` — server decide kare ki edit/delete buttons dikhane hain ya nahi
- **Self-referencing Comment model** — nested replies:
  ```prisma
  reply     Comment[] @relation("reply")
  Comment   Comment?  @relation("reply", fields: [commentId], references: [id])
  ```
- `createCommentAndReply(userId, comment, videoId, commentId?)` — `commentId` ho to reply, na ho to top-level. **Ek function, dono kaam.**
- React Query hydration pattern — server pe prefetch, `HydrationBoundary` se pass:
  ```tsx
  await query.prefetchQuery({ queryKey:["preview-video"], queryFn: () => getPreviewVideo(id) })
  <HydrationBoundary state={dehydrate(query)}>
  ```

### ✅ PROOF 7
Incognito me preview link kholo — video chale, comment ho jaye.

---

## PHASE 8 — Cloud Storage (Din 16)

Local disk ab scale nahi karega.

```js
const uploadResult = await new Promise((resolve, reject) => {
  const up = cloudinary.uploader.upload_stream(
    { resource_type: "video", folder: "vync", public_id: filename, chunk_size: 6_000_000 },
    (err, res) => err ? reject(err) : resolve(res)
  )
  fs.createReadStream(filePath).pipe(up)
})
videoUrl = uploadResult.secure_url
```

**Aur yahin fallback pattern seekho:**
```js
let videoUrl = `http://localhost:5001/videos/${filename}`   // default = local
let isCloudinary = false
try   { /* upload */ videoUrl = secure_url; isCloudinary = true }
catch { console.warn("Cloudinary failed, using local hosting") }
finally { if (isCloudinary) fs.unlink(filePath, ...) }
```

> **Ye philosophy poore project me repeat hoti hai:** har external dependency ka fallback ho. Cloudinary marey to local. Mic na mile to default mic. Wo bhi na mile to screen-only. Codec na ho to agla try.

### ✅ PROOF 8
Cloudinary URL se video chale, aur `temp_upload/` khaali ho jaye.

---

## PHASE 9 — AI Layer (Din 17–19)

**Sabse last me AI.** Kyunki ye product ka "nice to have" hai, "must have" nahi.

```js
if (plan === "PRO") {
  try {
    const file = await ai.files.upload({ file: filePath, config: { mimeType: "video/webm" }})

    let s = await ai.files.get({ name: file.name }), tries = 0
    while (s.state === "PROCESSING" && tries++ < 60) {
      await sleep(2000)
      s = await ai.files.get({ name: file.name })
    }
    if (s.state === "FAILED") throw new Error("Gemini failed")

    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ fileData: { fileUri: file.uri, mimeType: file.mimeType }}, { text: prompt }],
      config: { responseMimeType: "application/json" }   // ← JSON mode force
    })

    await axios.post(`.../transcribe`, { ...JSON.parse(res.text) })
    await ai.files.delete({ name: file.name })
  } catch (e) {
    console.log("AI failed, continuing without it")   // ← upload NAHI rukti
  }
}
```

**4 cheezein yahan seekhogey:**
1. Video turant usable nahi hoti Gemini pe → **polling loop** chahiye
2. **Timeout guard** (`tries < 60`) — warna infinite loop
3. `responseMimeType: "application/json"` → **structured output**, regex parsing se bachao
4. Poora block **isolated try/catch** me → AI down ho to bhi core product chale

**Aur frontend pe:** `parseTranscript()` — tolerant parser jo JSON array, nested `{transcript:[]}`, aur plain `[00:00] text` lines — teeno handle kare. Kyunki LLM output shape kabhi guaranteed nahi hoti.

### ✅ PROOF 9
PRO user record kare → 1-2 min baad title, summary, timestamped transcript apne aap aa jaye.

---

## PHASE 10 — Polish (Din 20+)

Ab ja ke wo sab jo shuru me tempting lagta hai:

| Feature | Kya seekhogey |
|---|---|
| Landing page | Route groups `(website)` |
| Invites + Nodemailer | Named relations (`sender`/`reciever`), email templates |
| Notifications | Side-effects ek flow me |
| First-view email | `views === 0` check, product-thinking touch |
| Stripe billing | Checkout sessions, plan gating |
| Floating webcam window | Teesra BrowserWindow |
| Studio tray + timer | `focusable: false`, elapsed-time (not counter) timer |
| FREE 5-min limit | Plan-based feature gating |
| `hide-plugin` IPC | Widget recording me capture na ho |
| Electron production build | `file://` toot-ta hai → apna `node:http` static server |
| Auto-update | `electron-updater` + GitHub releases |
| `INTERNAL_SERVER_SECRET` | Service-to-service auth |
| Dark theme, Radix UI | Design system |

---

## Full Timeline — Ek Nazar Me

| Phase | Din | Kya bana | Proof |
|---|---|---|---|
| 0 | — | Problem define | Kagaz pe 3 jawab |
| 1 | 1–2 | Electron screen capture | `test.webm` VLC me chale |
| 2 | 3–4 | Socket chunk upload | Server pe file playable |
| 3 | 5–7 | Next.js + Prisma + 2 API routes | DB me row, processing→false |
| 4 | 8 | Ugly video list page | **MVP done** ✅ |
| 5 | 9–10 | Clerk auth + CORS | 2 users, alag videos |
| 6 | 11–13 | Workspaces, folders, RQ+Redux | Video folder me move |
| 7 | 14–15 | Preview page, comments | Incognito me share chale |
| 8 | 16 | Cloudinary + fallback | Cloud URL se play |
| 9 | 17–19 | Gemini AI pipeline | Auto transcript |
| 10 | 20+ | Polish, billing, packaging | Production build |

**~3 hafte** solid kaam se poora product.

---

## 5 Principles Jo Is Order Ke Peeche Hain

**1. Risk-first, UI-last**
Sabse uncertain cheez pehle prove karo. UI hamesha ban jaayega, screen capture kaam kare na kare — ye pata nahi hota.

**2. Har phase ek chalta hua product**
Phase 4 pe hi kuch demo karne layak tha. Kabhi "2 hafte se kuch nahi chal raha" wali situation nahi aayi.

**3. Abstraction tab jab dard ho**
`useMutationData` din 1 pe nahi banaya. Jab 5 jagah wahi toast + invalidate + pending code repeat hua, **tab** abstract kiya. Isliye interview me uska reason bata sakta hoon.

**4. Har external dependency ka fallback**
Cloudinary → local. Selected mic → default mic → screen-only. Gemini → skip. Codec → negotiate. Core loop (record + share) kabhi nahi tootna chahiye.

**5. Data model pehle sochna**
`Video.source @unique` wala decision Phase 3 me liya — usne Phase 8 (Cloudinary URL swap) automatically solve kar diya. Schema me 10 minute extra sochna baad me 2 din bachata hai.

---

## Interview Me Kaise Bolna (ye ratt lo)

**Q: "Is project ko kaise approach kiya?"**

> "Maine risk-first approach liya. Pehle ye poochha ki sabse bada unknown kya hai — jawab tha screen capture aur chunked upload, kyunki browser se poori screen record hi nahi hoti. To maine pehle 2 din me ek bare-bones Electron spike banaya: `desktopCapturer` se sources liye, `getUserMedia` desktop constraints ke saath stream liya, `MediaRecorder` se local file save ki. Koi React nahi, koi auth nahi — sirf ye prove karna tha ki possible hai.
>
> Agle 2 din me Socket.io se chunks Express pe bheje aur wahan append write stream se assemble kiye. Yahin 3 bugs mile jo mujhe sabse zyada sikha gaye — write stream map connection ke andar tha jo reconnect pe file corrupt kar raha tha, `stream.end()` await nahi kar raha tha jisse aakhri chunk gayab ho jaata tha, aur `flags: 'w'` overwrite kar raha tha.
>
> Jab wo pipeline chal gayi, tab Next.js + Prisma jodi — sirf 2 models aur 2 API routes ke saath. Din 8 pe mera pehla end-to-end MVP tayyar tha: record karo, ek ugly page pe video dikhe.
>
> Uske baad layers add ki — auth, workspaces, comments, cloud storage — aur **AI sabse last me**, kyunki wo differentiator hai, dependency nahi. Isliye Gemini ka poora block isolated try/catch me hai; AI fail ho to video normally upload ho jaati hai."

**Q: "Aaj dobara banao to kya alag karte?"**
> "Teen cheezein. Ek — Phase 2 me hi socket authentication daalta, baad me retrofit karna mushkil hua. Do — chunks local disk ki jagah seedha S3 multipart pe bhejta, taaki Express stateless rehta aur horizontally scale karta. Teen — `parseTranscript` ke tests pehle likhta, kyunki wahi function sabse zyada edge cases handle karta hai aur main use baar-baar manually test karta raha."

**Q: "Agar sirf 1 hafta hota to?"**
> "Phase 1 se 5 tak — capture, upload, DB, ugly UI, auth. Workspaces, comments, AI sab chhod deta. Kyunki core loop record-upload-share hai; baaki sab uske upar ki layers hain."
