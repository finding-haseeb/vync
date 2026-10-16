"use client";

import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import React, { useState } from "react";
import Loader from "../loader";
import {
  Bot,
  FileTextIcon,
  Sparkles,
  Pencil,
  Clock,
  Wand2,
  CheckCircle2,
} from "lucide-react";
import { generateAiVideoSummary } from "@/actions/workspace";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Props = {
  plan: "PRO" | "FREE";
  trial: boolean;
  videoId: string;
};

const AiTools = ({ plan, trial, videoId }: Props) => {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      toast.loading("Analyzing video & generating AI intelligence with Gemini...", {
        id: "ai-generating",
      });

      const res = await generateAiVideoSummary(videoId);

      if (res && res.status === 200) {
        toast.success("✨ AI Title, Detailed Description & Transcript generated!", {
          id: "ai-generating",
        });
        router.refresh();
      } else {
        toast.error("Could not complete AI generation. Please try again.", {
          id: "ai-generating",
        });
      }
    } catch (err) {
      console.error("AI Tools generation error:", err);
      toast.error("Failed to generate AI content.", { id: "ai-generating" });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <TabsContent value="Ai tools" className="mt-2">
      <div className="p-6 bg-[#18181b]/80 border border-white/10 rounded-xl flex flex-col gap-y-6 backdrop-blur-md shadow-xl">
        {/* Header & Main Action */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-white tracking-tight">
                Vync AI Tools
              </h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-medium">
                PRO Activated
              </span>
            </div>
            <p className="text-sm text-neutral-400 mt-1">
              Harness Google Gemini to automatically summarize, title, and transcribe your recording.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-sm px-5 py-2.5 rounded-lg shadow-lg shadow-purple-500/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Loader state={isGenerating} color="#fff">
                <Wand2 className="w-4 h-4" />
                <span>{isGenerating ? "Analyzing with AI..." : "✨ Generate with AI"}</span>
              </Loader>
            </Button>
          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div className="p-4 rounded-lg bg-[#202024]/70 border border-white/5 flex items-start gap-3.5 hover:border-purple-500/30 transition-colors">
            <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Pencil className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold text-white">
                  Video Summary
                </h3>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
              </div>
              <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
                Generates Executive Overviews, Key Highlights & Technical Context.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-[#202024]/70 border border-white/5 flex items-start gap-3.5 hover:border-purple-500/30 transition-colors">
            <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold text-white">
                  Timestamped Transcript
                </h3>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
              </div>
              <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
                Creates a time-first interactive breakdown under the <strong>Transcript</strong> tab.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-[#202024]/70 border border-white/5 flex items-start gap-3.5 hover:border-purple-500/30 transition-colors">
            <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold text-white">
                  Smart Video Title
                </h3>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
              </div>
              <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
                Generates concise, descriptive 4-6 word professional titles automatically.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-[#202024]/70 border border-white/5 flex items-start gap-3.5 hover:border-purple-500/30 transition-colors">
            <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-semibold text-white">
                  AI Context Agent
                </h3>
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
              </div>
              <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
                Analyzes full video context for instant Q&A responses.
              </p>
            </div>
          </div>
        </div>
      </div>
    </TabsContent>
  );
};

export default AiTools;
