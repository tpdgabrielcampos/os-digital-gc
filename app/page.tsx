import { redirect } from "next/navigation";

// A página inicial é a entrada do dentista (criar conta / entrar).
export default function Home() {
  redirect("/entrar");
}
