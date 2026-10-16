"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, UserButton } from "@clerk/nextjs";
import { Menu, User, LayoutDashboard } from "lucide-react";

// 1. Extract links into an easily manageable array
const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Pricing", href: "#pricing" },
  { label: "Contact", href: "#contact" },
];

export const LandingPageNavBar = () => {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();

  return (
    <nav className="flex w-full justify-between items-center py-4 px-6 max-w-7xl mx-auto">
      {/* Left Section */}
      <div className="text-3xl font-bold tracking-tight flex items-center gap-x-3">
        <button className="p-2 -ml-2 hover:bg-zinc-900 rounded-lg transition-colors lg:hidden">
          <Menu className="w-8 h-8" />
        </button>

        <Link href="/" className="flex items-center gap-x-3">
          <Image
            alt="Vync logo"
            src="/vync-logof.png"
            width={40}
            height={40}
            className="w-auto h-auto"
            priority
          />
          Vync
        </Link>
      </div>

      {/* Center Section: Mapped Links with Active States */}
      <div className="hidden lg:flex items-center gap-x-4">
        {NAV_LINKS.map((link) => {
          const isActive = pathname === link.href;

          return (
            <Link
              key={link.label}
              href={link.href}
              className={`py-2 px-6 font-semibold text-base rounded-full transition-all ${
                isActive
                  ? "bg-[#7320DD] hover:bg-[#7320DD]/80 shadow-lg shadow-purple-500/20 text-white"
                  : "text-zinc-400 hover:text-white font-medium hover:bg-zinc-900"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-x-3">
        {isSignedIn ? (
          <div className="flex items-center gap-x-3">
            <Link
              href="/dashboard"
              className="text-sm font-semibold flex items-center gap-x-2 bg-purple-600 hover:bg-purple-700 text-white rounded-full px-5 h-10 transition-colors shadow-lg shadow-purple-500/20 cursor-pointer"
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </Link>
            <UserButton />
          </div>
        ) : (
          <Link
            href="/auth/sign-in"
            className="text-base flex items-center gap-x-2 bg-white text-black hover:bg-zinc-200 rounded-full px-6 h-11 transition-colors font-semibold shadow-sm cursor-pointer select-none"
          >
            <User className="w-4 h-4" fill="#000" />
            Login
          </Link>
        )}
      </div>
    </nav>
  );
};

export default LandingPageNavBar;
