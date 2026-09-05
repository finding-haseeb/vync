import React from "react";
import { hidePluginWindow } from "./utils";
import { v4 as uuid } from "uuid";
import io from "socket.io-client";

// Global variables
let videoTransferFileName: string | undefined;
let mediaRecorder: MediaRecorder;
let userId: string;

// Socket connection
const socket = io(import.meta.env.VITE_SOCKET_URL as string);

// Start recording function
export const StartRecording = (onSources: {
  screen: string;
  audio: string;
  id: string;
}) => {
  if (!onSources || !onSources.id || !onSources.screen) {
    console.error("Invalid sources provided for recording.");
    return;
  }

  hidePluginWindow(true);

  // Generate unique filename for the recorded video
  videoTransferFileName = `${uuid()}-${onSources.id.slice(0, 8)}.webm`;

  // Start the MediaRecorder
  if (mediaRecorder) {
    mediaRecorder.start(1000); // Collect chunks every second
  } else {
    console.error("MediaRecorder is not initialized.");
  }
};

// Stop recording function
export const onStopRecording = () => {
  hidePluginWindow(false);

  if (mediaRecorder) {
    mediaRecorder.stop();
  } else {
    console.error("MediaRecorder is not active.");
  }
};

// MediaRecorder stop event handler
const stopRecording = () => {
  hidePluginWindow(false);

  if (videoTransferFileName && userId) {
    socket.emit("process-video", {
      filename: videoTransferFileName,
      userId,
    });
  } else {
    console.error("Missing video filename or user ID.");
  }
};

// MediaRecorder data available event handler
export const onDataAvailable = (e: BlobEvent) => {
  if (e.data.size > 0 && videoTransferFileName) {
    socket.emit("video-chunks", {
      chunks: e.data,
      filename: videoTransferFileName,
    });
  } else {
    console.error("No data available or filename is missing.");
  }
};

// Select sources for screen and audio recording
export const selectSources = async (
  onSources: {
    screen: string;
    audio: string;
    id: string;
    preset: "HD" | "SD";
  },
  videoElement: React.RefObject<HTMLVideoElement>
) => {
  console.log("Selected Source Object:", onSources);
  if (!onSources || !onSources.screen || !onSources.id) {
    console.error("Invalid sources provided.");
    return;
  }

  userId = onSources.id;

  const constraints: any = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: onSources.screen,
        minWidth: onSources.preset === "HD" ? 1920 : 1280,
        maxWidth: onSources.preset === "HD" ? 1920 : 1280,
        minHeight: onSources.preset === "HD" ? 1080 : 720,
        maxHeight: onSources.preset === "HD" ? 1080 : 720,
        frameRate: 30,
      },
    },
  };

  try {
    console.log("Requesting screen capture with constraints:", constraints);
    const screenStream = await navigator.mediaDevices.getUserMedia(constraints);
    console.log("🟢 Screen capture stream acquired successfully!");

    let audioStream: MediaStream | null = null;
    if (onSources.audio) {
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: { deviceId: { exact: onSources.audio } },
        });
      } catch (err: any) {
        console.warn("Could not capture selected audio, trying fallback default microphone:", err?.message || err);
        try {
          audioStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true,
          });
        } catch (audioErr) {
          console.warn("No audio device accessible, continuing with screen capture only.");
        }
      }
    }

    if (videoElement && videoElement.current) {
      videoElement.current.srcObject = screenStream;
      videoElement.current.muted = true;
      try {
        await videoElement.current.play();
      } catch (playErr) {
        console.warn("Video preview play warning:", playErr);
      }
    }

    const currentStream = new MediaStream([
      ...screenStream.getVideoTracks(),
      ...(audioStream ? audioStream.getAudioTracks() : []),
    ]);

    const candidateTypes = [
      "video/webm; codecs=vp8,opus",
      "video/webm; codecs=vp8",
      "video/webm",
    ];

    let chosenMime = "";
    for (const type of candidateTypes) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
        chosenMime = type;
        break;
      }
    }

    mediaRecorder = new MediaRecorder(
      currentStream,
      chosenMime ? { mimeType: chosenMime } : undefined
    );

    mediaRecorder.ondataavailable = onDataAvailable;
    mediaRecorder.onstop = stopRecording;
    console.log("🟢 MediaRecorder initialized successfully with mimeType:", chosenMime || "browser default");
  } catch (error: any) {
    console.error("🔴 Error initializing screen recording stream:", error?.name, error?.message || error);
  }
};
