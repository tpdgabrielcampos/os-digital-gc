import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AdminShell from "@/components/gc/AdminShell";
import Financeiro from "@/components/gc/Financeiro";
import type { ConfigFiscal, DentistaFin, Historico, Lancamento, OSFin } from "@/lib/financeiro";

export const dynamic = "force-dynamic";

export default async function FinanceiroPage() {
  const [lanc, dent, ped, cfg, hist] = await Promise.all([
    supabaseAdmin.from("fin_lancamentos").select("*").order("competencia", { ascending: false }).limit(10000),
    supabaseAdmin.from("dentistas").select("*").order("nome"),
    supabaseAdmin
      .from("pedidos")
      .select("id, numero, paciente_nome, tipo_trabalho, dentista_id, dentista_nome, status, status_updated_at, valor_estimado, valor_final, cobranca_id")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabaseAdmin.from("fin_config").select("*").eq("id", 1).maybeSingle(),
    supabaseAdmin.from("fin_historico").select("*").order("mes"),
  ]);

  const faltaBanco = !!lanc.error && /fin_lancamentos|does not exist|schema cache/i.test(lanc.error.message);

  const dentistas: DentistaFin[] = (dent.data ?? []).map((d) => ({
    id: d.id,
    nome: d.nome || d.email || "Sem nome",
    clinica: d.clinica ?? null,
    whatsapp: d.whatsapp ?? null,
    forma_cobranca: d.forma_cobranca === "por_os" ? "por_os" : "mensal",
    dia_vencimento: Number(d.dia_vencimento) || 10,
  }));

  const os: OSFin[] = (ped.data ?? []).map((p) => ({
    id: p.id,
    numero: p.numero,
    paciente_nome: p.paciente_nome,
    tipo_trabalho: p.tipo_trabalho,
    dentista_id: p.dentista_id,
    dentista_nome: p.dentista_nome,
    status: p.status,
    entregue_em: p.status === "entregue" ? p.status_updated_at : null,
    valor_estimado: p.valor_estimado != null ? Number(p.valor_estimado) : null,
    valor_final: (p as { valor_final?: number | null }).valor_final != null ? Number((p as { valor_final?: number }).valor_final) : null,
    cobranca_id: (p as { cobranca_id?: string | null }).cobranca_id ?? null,
  }));

  const config: ConfigFiscal = {
    regime: cfg.data?.regime ?? "simples",
    anexo: (cfg.data?.anexo as ConfigFiscal["anexo"]) ?? "III",
    aliquota_manual: cfg.data?.aliquota_manual != null ? Number(cfg.data.aliquota_manual) : null,
  };

  return (
    <AdminShell ativo="/dashboard/financeiro" largo>
      <Financeiro
        faltaBanco={faltaBanco}
        lancamentos={((lanc.data ?? []) as Lancamento[]).map((l) => ({ ...l, valor: Number(l.valor) }))}
        dentistas={dentistas}
        os={os}
        config={config}
        historico={((hist.data ?? []) as Historico[]).map((h) => ({ mes: h.mes, receita: Number(h.receita) }))}
      />
    </AdminShell>
  );
}
