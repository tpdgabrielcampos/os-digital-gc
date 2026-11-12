"use client";

import PortalShell, { useDentista } from "@/components/gc/PortalShell";
import FormularioOS from "@/components/gc/FormularioOS";

export default function NovaOSPage() {
  return (
    <PortalShell ativo="/portal/nova">
      <NovaOS />
    </PortalShell>
  );
}

function NovaOS() {
  const { sessao, dentista, nomeTabela } = useDentista();
  return <FormularioOS modo="dentista" dentista={dentista} nomeTabela={nomeTabela} token={sessao.access_token} />;
}
