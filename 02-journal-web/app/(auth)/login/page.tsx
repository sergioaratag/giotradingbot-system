import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="w-full max-w-sm">
      <div
        className="flex justify-center mb-12 gio-slide-up"
        style={{ animationDelay: "0ms" }}
      >
        <Logo size="lg" />
      </div>

      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>

      <div
        className="mt-16 text-center text-mute"
        style={{ fontSize: "9px", letterSpacing: "0.32em" }}
      >
        EST · 2026
      </div>
    </div>
  );
}
