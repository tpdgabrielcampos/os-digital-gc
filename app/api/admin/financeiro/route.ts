import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { adminAutorizado } from "@/lib/adminAuth";
import { CATEGORIAS_ENTRADA, CATEGORIAS_SAIDA, diaNoMes, somaMeses } from "@/lib/financeiro";

// Todas as gravações do financeiro (só o painel do laboratório).

const data = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const texto = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const numero = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};
const erro = (msg: string, status = 400) => NextResponse.json({ ok: false, erro: msg }, { status });

export async function POST(req: NextRequest) {
  if (!adminAutorizado(req)) return erro("Não autorizado", 401);
  const b = await req.json().catch(() => null);
  if (!b?.acao) return erro("requisição inválida");

  switch (b.acao) {
    case "salvar": {
      const l = b.lanc ?? {};
      const tipo = l.tipo === "entrada" ? "entrada" : l.tipo === "saida" ? "saida" : null;
      const valor = numero(l.valor);
      const competencia = data(l.competencia);
      const descricao = texto(l.descricao, 200);
      const categoria = texto(l.categoria, 60);
      if (!tipo || valor == null || !competencia || !descricao || !categoria) return erro("Preencha tipo, descrição, categoria, valor e data.");
      if (![...CATEGORIAS_ENTRADA, ...CATEGORIAS_SAIDA].includes(categoria)) return erro("Categoria inválida.");
      const base = {
        tipo,
        descricao,
        categoria,
        valor,
        competencia,
        vencimento: data(l.vencimento) ?? competencia,
        pago_em: data(l.pago_em),
        forma_pagamento: texto(l.forma_pagamento, 40),
        dentista_id: texto(l.dentista_id, 60),
        pedido_id: texto(l.pedido_id, 60),
        fornecedor: texto(l.fornecedor, 120),
        nf_status: ["pendente", "emitida", "nao_se_aplica"].includes(l.nf_status) ? l.nf_status : tipo === "saida" ? "nao_se_aplica" : "pendente",
        nf_numero: texto(l.nf_numero, 40),
        observacoes: texto(l.observacoes, 1000),
      };

      if (l.id) {
        const { error } = await supabaseAdmin.from("fin_lancamentos").update(base).eq("id", l.id);
        if (error) return erro(error.message, 500);
        return NextResponse.json({ ok: true });
      }

      // Novo: pode ser único, parcelado (divide o valor) ou recorrente (repete o valor) por N meses.
      const vezes = Math.min(Math.max(Number(b.repetir?.vezes) || 1, 1), 60);
      const modo = b.repetir?.modo === "parcelas" ? "parcelas" : "recorrente";
      if (vezes === 1) {
        const { error } = await supabaseAdmin.from("fin_lancamentos").insert(base);
        if (error) return erro(error.message, 500);
        return NextResponse.json({ ok: true });
      }
      const grupo = crypto.randomUUID();
      const parcelaValor = modo === "parcelas" ? Math.floor((valor / vezes) * 100) / 100 : valor;
      const linhas = Array.from({ length: vezes }, (_, i) => {
        const mesComp = somaMeses(competencia.slice(0, 7), i);
        const mesVenc = somaMeses(base.vencimento.slice(0, 7), i);
        const ultima = i === vezes - 1 && modo === "parcelas";
        return {
          ...base,
          valor: ultima ? Math.round((valor - parcelaValor * (vezes - 1)) * 100) / 100 : parcelaValor,
          competencia: diaNoMes(mesComp, Number(competencia.slice(8, 10))),
          vencimento: diaNoMes(mesVenc, Number(base.vencimento.slice(8, 10))),
          pago_em: i === 0 ? base.pago_em : null,
          parcela: `${i + 1}/${vezes}`,
          grupo,
        };
      });
      const { error } = await supabaseAdmin.from("fin_lancamentos").insert(linhas);
      if (error) return erro(error.message, 500);
      return NextResponse.json({ ok: true });
    }

    case "excluir": {
      if (!b.id) return erro("id obrigatório");
      let q = supabaseAdmin.from("fin_lancamentos").delete();
      if (b.grupo) {
        // apaga esta e as próximas do mesmo grupo que ainda não foram pagas
        const { data: l } = await supabaseAdmin.from("fin_lancamentos").select("grupo, competencia").eq("id", b.id).maybeSingle();
        if (!l?.grupo) q = q.eq("id", b.id);
        else q = q.eq("grupo", l.grupo).gte("competencia", l.competencia).is("pago_em", null);
      } else q = q.eq("id", b.id);
      const { error } = await q;
      if (error) return erro(error.message, 500);
      return NextResponse.json({ ok: true });
    }

    case "pagar": {
      if (!b.id) return erro("id obrigatório");
      const upd: Record<string, unknown> = { pago_em: data(b.pago_em) };
      if (b.forma_pagamento !== undefined) upd.forma_pagamento = texto(b.forma_pagamento, 40);
      const { error } = await supabaseAdmin.from("fin_lancamentos").update(upd).eq("id", b.id);
      if (error) return erro(error.message, 500);
      return NextResponse.json({ ok: true });
    }

    case "nf": {
      if (!b.id) return erro("id obrigatório");
      const st = ["pendente", "emitida", "nao_se_aplica"].includes(b.nf_status) ? b.nf_status : "pendente";
      const { error } = await supabaseAdmin.from("fin_lancamentos").update({ nf_status: st, nf_numero: texto(b.nf_numero, 40) }).eq("id", b.id);
      if (error) return erro(error.message, 500);
      return NextResponse.json({ ok: true });
    }

    case "cobrar": {
      // Gera a cobrança (entrada) de um dentista com as OS escolhidas: fechamento do mês ou OS avulsa.
      const dentistaId = texto(b.dentista_id, 60);
      const lista: { id: string; valor: unknown }[] = Array.isArray(b.os) ? b.os : [];
      const vencimento = data(b.vencimento);
      const competencia = data(b.competencia);
      if (!dentistaId || !lista.length || !vencimento || !competencia) return erro("Escolha o dentista, as OS e o vencimento.");
      const itens = lista.map((o) => ({ id: String(o.id), valor: numero(o.valor) ?? 0 }));
      const total = Math.round(itens.reduce((s, o) => s + o.valor, 0) * 100) / 100;
      const { data: dent } = await supabaseAdmin.from("dentistas").select("nome").eq("id", dentistaId).maybeSingle();
      const { data: oss } = await supabaseAdmin.from("pedidos").select("id, numero, cobranca_id").in("id", itens.map((o) => o.id));
      if ((oss ?? []).some((o) => o.cobranca_id)) return erro("Alguma dessas OS já foi cobrada. Atualize a página.", 409);
      const nums = (oss ?? []).map((o) => `GC-${String(o.numero ?? 0).padStart(4, "0")}`).sort();
      const fechamento = b.modo === "mensal";
      const { data: lanc, error } = await supabaseAdmin
        .from("fin_lancamentos")
        .insert({
          tipo: "entrada",
          categoria: fechamento ? "Fechamento mensal" : "Serviços (OS)",
          descricao: fechamento
            ? `Fechamento ${competencia.slice(5, 7)}/${competencia.slice(0, 4)} — ${dent?.nome ?? "dentista"}`
            : `${nums.join(", ")} — ${dent?.nome ?? "dentista"}`,
          valor: total,
          competencia,
          vencimento,
          dentista_id: dentistaId,
          nf_status: "pendente",
          observacoes: `OS: ${nums.join(", ")}`,
        })
        .select("id")
        .single();
      if (error || !lanc) return erro(error?.message ?? "não consegui criar a cobrança", 500);
      for (const o of itens) {
        await supabaseAdmin.from("pedidos").update({ cobranca_id: lanc.id, valor_final: o.valor }).eq("id", o.id);
      }
      return NextResponse.json({ ok: true, id: lanc.id });
    }

    case "dentista": {
      if (!b.id) return erro("id obrigatório");
      const upd: Record<string, unknown> = {};
      if (b.forma_cobranca === "mensal" || b.forma_cobranca === "por_os") upd.forma_cobranca = b.forma_cobranca;
      if (b.dia_vencimento != null) upd.dia_vencimento = Math.min(Math.max(Number(b.dia_vencimento) || 10, 1), 31);
      const { error } = await supabaseAdmin.from("dentistas").update(upd).eq("id", b.id);
      if (error) return erro(error.message, 500);
      return NextResponse.json({ ok: true });
    }

    case "config": {
      const anexo = ["I", "II", "III", "V"].includes(b.anexo) ? b.anexo : "III";
      const manual = b.aliquota_manual === null || b.aliquota_manual === "" ? null : numero(b.aliquota_manual);
      const { error } = await supabaseAdmin.from("fin_config").upsert({ id: 1, anexo, aliquota_manual: manual, atualizado_em: new Date().toISOString() });
      if (error) return erro(error.message, 500);
      return NextResponse.json({ ok: true });
    }

    case "historico": {
      const mes = data(b.mes);
      const receita = numero(b.receita);
      if (!mes || receita == null) return erro("mês e receita obrigatórios");
      const { error } = await supabaseAdmin.from("fin_historico").upsert({ mes: mes.slice(0, 7) + "-01", receita });
      if (error) return erro(error.message, 500);
      return NextResponse.json({ ok: true });
    }
  }
  return erro("ação inválida");
}
