"use client";

import { useEffect, useState } from "react";

// Idiomas da tela de entrada/cadastro do dentista (clientes do exterior).
export type Idioma = "pt" | "es" | "en";
export const IDIOMAS: { id: Idioma; nome: string }[] = [
  { id: "pt", nome: "Português" },
  { id: "es", nome: "Español" },
  { id: "en", nome: "English" },
];

const CHAVE = "gc_idioma";

/** Idioma escolhido (guardado no aparelho); na primeira visita segue o idioma do navegador. */
export function useIdioma(): [Idioma, (i: Idioma) => void] {
  const [idioma, setIdioma] = useState<Idioma>("pt");
  useEffect(() => {
    let salvo: string | null = null;
    try {
      salvo = localStorage.getItem(CHAVE);
    } catch {}
    if (salvo === "pt" || salvo === "es" || salvo === "en") return setIdioma(salvo);
    const nav = (navigator.language || "").toLowerCase();
    if (nav.startsWith("es")) setIdioma("es");
    else if (nav.startsWith("en")) setIdioma("en");
  }, []);
  useEffect(() => {
    document.documentElement.lang = idioma === "pt" ? "pt-BR" : idioma;
  }, [idioma]);
  function escolher(i: Idioma) {
    setIdioma(i);
    try {
      localStorage.setItem(CHAVE, i);
    } catch {}
    document.cookie = `${CHAVE}=${i}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }
  return [idioma, escolher];
}

const pt = {
  criarConta: "Criar conta",
  jaTenhoConta: "Já tenho conta",
  tituloCriar: "Crie seu acesso",
  tituloEntrar: "Bem-vindo de volta",
  tituloEsqueci: "Esqueci a senha",
  subCriar: "Leva 1 minuto. Depois é só entrar e enviar suas OS.",
  subEntrar: "Entre com o e-mail e a senha da sua conta.",
  subEsqueci: "Digite o seu e-mail para receber o link de uma senha nova.",
  nome: "Nome completo",
  nomeEx: "Ex: Dra. Ana Souza",
  clinica: "Clínica",
  clinicaEx: "Nome da clínica (opcional)",
  whatsapp: "WhatsApp",
  whatsappEx: "(51) 9 9999-0000",
  email: "E-mail",
  emailEx: "voce@clinica.com.br",
  senha: "Senha",
  senhaMin: "mínimo 8 caracteres",
  suaSenha: "sua senha",
  aguarde: "Aguarde…",
  botaoCriar: "Criar conta e entrar",
  botaoEntrar: "Entrar",
  botaoLink: "Enviar link",
  esqueci: "Esqueci a senha",
  voltar: "Voltar",
  idioma: "Idioma",
  errNome: "Preencha o seu nome.",
  errSenha: "A senha precisa ter pelo menos 8 caracteres.",
  errLogin: "E-mail ou senha incorretos.",
  errJaExiste: 'Esse e-mail já tem conta. Use "Já tenho conta" para entrar.',
  errConfirmar: "Falta confirmar o e-mail: abra a mensagem que enviamos e clique no link.",
  errLimite: "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.",
  avisoCriada: "Conta criada! Enviamos um e-mail de confirmação. Clique no link da mensagem e depois entre aqui.",
  avisoLink: "Se esse e-mail tiver conta, você vai receber um link para criar uma senha nova.",
  novaTitulo: "Criar senha nova",
  novaCampo: "Senha nova",
  novaExpirou: 'O link expirou. Peça um novo em "Esqueci a senha".',
  salvando: "Salvando…",
  salvarEntrar: "Salvar e entrar",
};

export type Textos = typeof pt;

const es: Textos = {
  criarConta: "Crear cuenta",
  jaTenhoConta: "Ya tengo cuenta",
  tituloCriar: "Cree su acceso",
  tituloEntrar: "Bienvenido de nuevo",
  tituloEsqueci: "Olvidé mi contraseña",
  subCriar: "Lleva 1 minuto. Después solo tiene que entrar y enviar sus órdenes.",
  subEntrar: "Entre con el correo y la contraseña de su cuenta.",
  subEsqueci: "Escriba su correo para recibir el enlace de una contraseña nueva.",
  nome: "Nombre completo",
  nomeEx: "Ej.: Dra. Ana Souza",
  clinica: "Clínica",
  clinicaEx: "Nombre de la clínica (opcional)",
  whatsapp: "WhatsApp",
  whatsappEx: "+34 600 000 000",
  email: "Correo electrónico",
  emailEx: "usted@clinica.com",
  senha: "Contraseña",
  senhaMin: "mínimo 8 caracteres",
  suaSenha: "su contraseña",
  aguarde: "Espere…",
  botaoCriar: "Crear cuenta y entrar",
  botaoEntrar: "Entrar",
  botaoLink: "Enviar enlace",
  esqueci: "Olvidé mi contraseña",
  voltar: "Volver",
  idioma: "Idioma",
  errNome: "Escriba su nombre.",
  errSenha: "La contraseña debe tener al menos 8 caracteres.",
  errLogin: "Correo o contraseña incorrectos.",
  errJaExiste: 'Ese correo ya tiene cuenta. Use "Ya tengo cuenta" para entrar.',
  errConfirmar: "Falta confirmar el correo: abra el mensaje que le enviamos y haga clic en el enlace.",
  errLimite: "Demasiados intentos seguidos. Espere unos minutos e inténtelo de nuevo.",
  avisoCriada: "¡Cuenta creada! Le enviamos un correo de confirmación. Haga clic en el enlace del mensaje y después entre aquí.",
  avisoLink: "Si ese correo tiene cuenta, recibirá un enlace para crear una contraseña nueva.",
  novaTitulo: "Crear contraseña nueva",
  novaCampo: "Contraseña nueva",
  novaExpirou: 'El enlace caducó. Pida uno nuevo en "Olvidé mi contraseña".',
  salvando: "Guardando…",
  salvarEntrar: "Guardar y entrar",
};

const en: Textos = {
  criarConta: "Create account",
  jaTenhoConta: "I have an account",
  tituloCriar: "Create your access",
  tituloEntrar: "Welcome back",
  tituloEsqueci: "Forgot password",
  subCriar: "It takes 1 minute. Then just sign in and send your work orders.",
  subEntrar: "Sign in with your account's email and password.",
  subEsqueci: "Enter your email to receive a link to set a new password.",
  nome: "Full name",
  nomeEx: "e.g. Dr. Ana Souza",
  clinica: "Clinic",
  clinicaEx: "Clinic name (optional)",
  whatsapp: "WhatsApp",
  whatsappEx: "+1 555 000 0000",
  email: "Email",
  emailEx: "you@clinic.com",
  senha: "Password",
  senhaMin: "at least 8 characters",
  suaSenha: "your password",
  aguarde: "Please wait…",
  botaoCriar: "Create account and sign in",
  botaoEntrar: "Sign in",
  botaoLink: "Send link",
  esqueci: "Forgot password",
  voltar: "Back",
  idioma: "Language",
  errNome: "Please enter your name.",
  errSenha: "The password must have at least 8 characters.",
  errLogin: "Incorrect email or password.",
  errJaExiste: 'This email already has an account. Use "I have an account" to sign in.',
  errConfirmar: "Your email isn't confirmed yet: open the message we sent and click the link.",
  errLimite: "Too many attempts in a row. Wait a few minutes and try again.",
  avisoCriada: "Account created! We sent you a confirmation email. Click the link in the message, then sign in here.",
  avisoLink: "If this email has an account, you'll receive a link to create a new password.",
  novaTitulo: "Create a new password",
  novaCampo: "New password",
  novaExpirou: 'The link has expired. Request a new one under "Forgot password".',
  salvando: "Saving…",
  salvarEntrar: "Save and sign in",
};

export const TEXTOS: Record<Idioma, Textos> = { pt, es, en };

/** Mensagens de erro do login (Supabase) no idioma escolhido. */
export function traduzErroAuth(msg: string, t: Textos) {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return t.errLogin;
  if (m.includes("already registered") || m.includes("already been registered")) return t.errJaExiste;
  if (m.includes("email not confirmed")) return t.errConfirmar;
  if (m.includes("password")) return t.errSenha;
  if (m.includes("rate limit")) return t.errLimite;
  return msg;
}
