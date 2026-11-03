import { createClient } from "@supabase/supabase-js";

// Cliente para uso SOMENTE no servidor (API routes / server components do dashboard).
// Usa a service role key, que ignora RLS — nunca importe este arquivo em código
// que roda no navegador.
//
// Os valores caem para um placeholder quando as variáveis de ambiente não
// estão definidas (ex: durante o build, antes de configurá-las no Vercel).
// Isso evita que o build inteiro quebre — se as variáveis reais faltarem em
// tempo de execução, o erro aparece só quando a página tenta buscar dados,
// não na hora de compilar o site.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

// O Next.js guarda em cache as respostas de fetch() feitas no servidor. Sem o
// "no-store" abaixo, o painel podia mostrar uma lista antiga de pedidos (sem
// as OS mais recentes). Assim toda consulta vai direto ao banco.
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
  },
});
