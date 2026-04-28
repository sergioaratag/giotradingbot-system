import { SettingsForm } from "@/components/SettingsForm";

export default function SettingsPage() {
  return (
    <div className="max-w-2xl">
      <header className="pt-2 pb-8">
        <h1
          className="text-cream"
          style={{
            fontFamily: "var(--font-fraunces), serif",
            fontSize: "2rem",
            letterSpacing: "-0.01em",
          }}
        >
          Settings
        </h1>
        <p className="text-dust mt-1 text-sm">Tu sistema, tus reglas.</p>
      </header>

      <SettingsForm />
    </div>
  );
}
