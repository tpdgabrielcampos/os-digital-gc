"use client";

import { useRouter } from "next/navigation";
import { I } from "@/components/gc/ui";

export default function LogoutButton() {
  const router = useRouter();

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/dashboard/login");
    router.refresh();
  }

  return (
    <button onClick={sair} title="Sair" className="text-slate-400 hover:text-white">
      {I.sair}
    </button>
  );
}
