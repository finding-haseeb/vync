"use client";

import { TabsContent } from "@/components/ui/tabs";
import React, { useState } from "react";
import { Clock, Copy, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  transcript: string;
};

interface TranscriptEntry {
  time: string;
  text: string;
}

function parseTranscript(raw: string | null | undefined): TranscriptEntry[] {
  if (!raw || !raw.trim()) return [];
  const cleanRaw = raw.trim();

  // 1. Try JSON parsing
  try {
    const parsed = JSON.parse(cleanRaw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item, idx) => {
          if (typeof item === "string") {
            return parseLine(item, idx);
          }
          const time =
            item.time || item.timestamp || item.ts || formatSeconds(idx * 15);
          const text =
            item.text ||
            item.content ||
            item.summary ||
            item.message ||
            JSON.stringify(item);
          return { time: String(time).trim(), text: String(text).trim() };
        })
        .filter((item) => item.text.length > 0);
    } else if (typeof parsed === "object" && parsed !== null) {
      if (Array.isArray(parsed.transcript)) {
        return parseTranscript(JSON.stringify(parsed.transcript));
      }
      if (Array.isArray(parsed.segments)) {
        return parseTranscript(JSON.stringify(parsed.segments));
      }
    }
  } catch {
    // Not valid JSON, continue to line parsing
  }

  // 2. Line-by-line parsing
  const lines = cleanRaw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length > 0) {
    return lines.map((line, idx) => parseLine(line, idx));
  }

  return [];
}

function parseLine(line: string, fallbackIdx: number): TranscriptEntry {
  // Matches "[00:00] text", "00:00 - text", "00:00: text", "00:00 text"
  const match = line.match(/^(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?)\s*[-:]?\s*(.+)$/);
  if (match) {
    return {
      time: match[1],
      text: match[2].trim(),
    };
  }
  return {
    time: formatSeconds(fallbackIdx * 15),
    text: line.trim(),
  };
}

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

const VideoTranscript = ({ transcript }: Props) => {
  const [copied, setCopied] = useState(false);
  const entries = parseTranscript(transcript);

  const handleCopy = () => {
    if (entries.length === 0) return;
    const formatted = entries
      .map((item) => `[${item.time}] ${item.text}`)
      .join("\n\n");
    navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TabsContent
      value="Transcript"
      className="rounded-xl flex flex-col gap-y-4 bg-[#18181b]/70 border border-white/10 p-5 mt-2 shadow-xl backdrop-blur-md"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-purple-400" />
          <h3 className="font-semibold text-white text-sm">
            Automated Transcript
          </h3>
          {entries.length > 0 && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-medium">
              {entries.length} timestamps
            </span>
          )}
        </div>

        {entries.length > 0 && (
          <Button
            onClick={handleCopy}
            variant="ghost"
            size="sm"
            className="h-8 px-2.5 text-xs text-neutral-300 hover:text-white hover:bg-white/10 flex items-center gap-1.5 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-400" />
                <span className="text-green-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Transcript</span>
              </>
            )}
          </Button>
        )}
      </div>

      {/* Transcript Items: Time Number FIRST, then Text */}
      {entries.length > 0 ? (
        <div className="flex flex-col gap-2.5 max-h-[440px] overflow-y-auto pr-1 select-text scrollbar-thin scrollbar-thumb-white/10">
          {entries.map((item, index) => (
            <div
              key={index}
              className="group flex items-start gap-3 p-3.5 rounded-lg bg-[#202024]/80 border border-white/5 hover:border-purple-500/40 hover:bg-[#26262d] transition-all duration-150"
            >
              {/* 1. Time Number FIRST */}
              <div className="flex-shrink-0 px-2.5 py-1 rounded-md bg-purple-500/15 border border-purple-500/30 text-purple-300 font-mono text-xs font-bold tracking-wider group-hover:bg-purple-600 group-hover:text-white transition-colors shadow-sm">
                {item.time}
              </div>

              {/* 2. Detailed Text SECOND */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-neutral-200 leading-relaxed group-hover:text-white transition-colors">
                  {item.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 text-neutral-400">
            <Sparkles className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-neutral-300">
              No transcript available yet
            </p>
            <p className="text-xs text-neutral-500 mt-1 max-w-[260px]">
              Switch to the <strong>Ai tools</strong> tab and click <strong>Generate with AI</strong> to transcribe this recording.
            </p>
          </div>
        </div>
      )}
    </TabsContent>
  );
};

export default VideoTranscript;
