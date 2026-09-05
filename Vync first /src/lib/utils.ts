import { clsx, type ClassValue } from "clsx";
import { sl } from "date-fns/locale";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const truncateString = (string: string, slice?: number) => {
  return string.slice(0, slice || 30) + "...";
};

export type GitHubAsset = {
  name: string;
  browser_download_url: string;
};

export type GitHubRelease = {
  assets: GitHubAsset[];
};

export const downloadLatestDesktopApp = async () => {
  try {
    const isMac =
      typeof window !== "undefined" &&
      /Mac|iPhone|iPod|iPad/i.test(navigator.userAgent);

    const res = await fetch(
      "https://api.github.com/repos/haseeb/vync-desktop/releases/latest",
    );

    const release: GitHubRelease = await res.json();

    let targetAsset = release.assets?.find((asset) =>
      isMac
        ? (asset.name.endsWith(".dmg") || asset.name.endsWith(".zip")) &&
          !asset.name.endsWith(".blockmap")
        : asset.name.endsWith(".exe") && !asset.name.endsWith(".exe.blockmap"),
    );

    if (!targetAsset && release.assets?.length) {
      targetAsset = release.assets.find(
        (asset) =>
          !asset.name.endsWith(".blockmap") &&
          (asset.name.endsWith(".dmg") || asset.name.endsWith(".exe")),
      );
    }

    if (targetAsset?.browser_download_url) {
      window.open(targetAsset.browser_download_url, "_blank");
    } else {
      window.open(
        "https://github.com/haseeb/vync-desktop/releases/latest",
        "_blank",
      );
    }
  } catch (error) {
    console.error("Download failed:", error);
    window.open(
      "https://github.com/haseeb/vync-desktop/releases/latest",
      "_blank",
    );
  }
};