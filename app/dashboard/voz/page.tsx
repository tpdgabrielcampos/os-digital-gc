import AdminShell from "@/components/gc/AdminShell";
import ConfigVoz from "@/components/gc/ConfigVoz";

export const dynamic = "force-dynamic";

export default function VozPage() {
  return (
    <AdminShell ativo="/dashboard/voz">
      <ConfigVoz />
    </AdminShell>
  );
}
