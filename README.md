# Vync 🎥✨
### Next-Gen AI Video Collaboration & Screen Intelligence Platform

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![Electron](https://img.shields.io/badge/Electron-30-47848F?style=for-the-badge&logo=electron)](https://www.electronjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-336791?style=for-the-badge&logo=postgresql)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?style=for-the-badge&logo=prisma)](https://www.prisma.io/)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-AI-orange?style=for-the-badge&logo=google)](https://ai.google.dev/)
[![Clerk](https://img.shields.io/badge/Clerk-Auth-6C47FF?style=for-the-badge&logo=clerk)](https://clerk.com/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)

**Vync** is a full-stack, enterprise-ready video recording and collaboration platform (Loom alternative) supercharged with **Google Gemini AI**. It enables individuals and teams to capture high-definition screen, camera, and microphone recordings, share them instantly via shareable links, and automatically generate structured AI video summaries, key takeaways, and timestamped transcripts.

---

## 🌟 Key Features

- 🖥️ **High-Performance Screen & Media Capture**: Lightweight Electron desktop application providing multi-display recording, customizable framerates, and system audio capture.
- 🤖 **Gemini AI Video Intelligence**: Instant AI-generated video summaries, action items, key topics, and precise chronological transcripts with interactive `[00:00]` timestamp badges.
- ⚡ **Instant Shareable Streaming**: Zero waiting time for long cloud video rendering. Share video links instantly with streaming support (`Accept-Ranges: bytes`).
- 📁 **Workspaces & Folder Management**: Create dedicated collaborative spaces, organize videos by client or sprint, and invite team members.
- 💬 **Interactive Feedback & Timestamps**: Viewers can leave timestamped comments and feedback directly on the video player.
- 🔒 **Enterprise-Grade Authentication**: Seamless user management, multi-factor auth, and organization roles powered by Clerk.

---

## 🏗️ Architecture & Monorepo Structure

```plaintext
vync/
├── Vync first/          # Next.js 16 Web Platform & Dashboard (Vercel-ready)
│   ├── src/
│   │   ├── actions/     # Next.js Server Actions (AI summarization, workspaces)
│   │   ├── app/         # App Router (Website, Dashboard, Auth, Video Preview)
│   │   ├── components/  # Modern UI components (Radix UI, Tailwind CSS)
│   │   └── lib/         # Prisma Client, Clerk integration, utility helpers
│   └── prisma/          # Database schema & PostgreSQL migrations
│
├── vync-desktop/        # Electron + Vite Desktop Application (macOS & Windows)
│   ├── electron/        # Main & Preload Electron processes, IPC handlers
│   └── src/             # Studio Tray, Media Configuration & Clerk Auth Modal
│
└── vync-express/        # High-throughput Media & WebSocket Streaming Server
    ├── server.js        # Socket.io chunk ingestion, Cloudinary fallback
    └── temp_upload/     # Local streaming cache
```

---

## 🚀 Quick Start & Local Setup

### Prerequisites
- **Node.js**: `v20+` or `v22+`
- **PostgreSQL**: Running locally or via Supabase / Neon
- **Package Manager**: `npm`

### 1. Web Platform Setup
```bash
cd "Vync first"
npm install
npx prisma db push
npm run dev
# Running on http://localhost:3000
```

### 2. Express Backend Setup
```bash
cd "../vync-express "
npm install
npm run dev
# Running on http://localhost:5001
```

### 3. Desktop Application Setup
```bash
cd "../vync-desktop"
npm install
npm run dev
# Launches native Electron recording window
```

---

## 🌐 Deploying to Vercel

1. Push this repository to GitHub.
2. Go to [Vercel Dashboard](https://vercel.com/new) and import the repository.
3. In **Project Settings**:
   - **Root Directory**: Select `Vync first`
   - **Framework Preset**: `Next.js`
4. Add the following **Environment Variables**:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `DATABASE_URL` (PostgreSQL connection string from Neon/Supabase)
   - `GEMINI_API_KEY`
   - `NEXT_PUBLIC_HOST_URL` (Your Vercel production domain)
5. Click **Deploy**! 🚀

---

## 📄 License
This project is licensed under the MIT License.
