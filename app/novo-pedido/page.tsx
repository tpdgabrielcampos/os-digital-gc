import { redirect } from "next/navigation";

// O formulário público antigo deu lugar ao portal com login.
export default function NovoPedidoAntigo() {
  redirect("/portal/nova");
}
