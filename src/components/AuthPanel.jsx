import { useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import Logo from "./Logo.jsx";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient.js";

const REMEMBER_EMAIL_KEY = "flux-time:remember-email";
const ALLOWED_EMAIL_DOMAINS = ["gmail.com", "hotmail.com", "outlook.com"];

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function isAllowedEmailDomain(email) {
  const domain = normalizeEmail(email).split("@")[1];
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

function authErrorMessage(message) {
  if (!message) return "Nao foi possivel concluir o acesso.";
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Confirme seu e-mail antes de entrar.";
  }
  if (normalized.includes("password should be")) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }
  if (normalized.includes("user already registered")) {
    return "Esse e-mail ja tem uma conta.";
  }
  return message;
}

export default function AuthPanel({ recoveryMode = false, onComplete, onPasswordUpdated }) {
  const [mode, setMode] = useState(recoveryMode ? "recover-update" : "login");
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(REMEMBER_EMAIL_KEY) || "";
    } catch {
      return "";
    }
  });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [remember, setRemember] = useState(Boolean(email));
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [canResendConfirmation, setCanResendConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef(null);

  const isLogin = mode === "login";
  const isRegister = mode === "register";
  const isRecoverRequest = mode === "recover-request";
  const isRecoverUpdate = mode === "recover-update";

  useLayoutEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const items = form.querySelectorAll(
      ".auth-field, .auth-remember, .auth-resend, .auth-form__error, .auth-form__message, .auth-submit"
    );
    gsap.fromTo(
      items,
      { autoAlpha: 0, y: reduce ? 0 : 8 },
      {
        autoAlpha: 1,
        y: 0,
        duration: reduce ? 0 : 0.24,
        ease: "power2.out",
        stagger: reduce ? 0 : 0.035,
        clearProps: "opacity,visibility,transform",
      }
    );
  }, [mode]);

  function changeMode(nextMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
    setCanResendConfirmation(false);
    setPassword("");
    setConfirmPassword("");
  }

  async function handleResetRequest() {
    if (!isSupabaseConfigured || !supabase) {
      setError("Configure o Supabase no .env.local para continuar.");
      return;
    }

    if (!isValidEmail(email)) {
      setError("Informe um e-mail valido.");
      return;
    }

    if (!isAllowedEmailDomain(email)) {
      setError("Use um e-mail Gmail, Hotmail ou Outlook.");
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    setEmail(normalizedEmail);
    setError("");
    setMessage("");
    setSubmitting(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      normalizedEmail,
      {
        redirectTo: window.location.origin,
      }
    );

    if (resetError) {
      setError(authErrorMessage(resetError.message));
    } else {
      setMessage("Enviamos um link para redefinir sua senha.");
    }

    setSubmitting(false);
  }

  async function handlePasswordUpdate() {
    if (!isSupabaseConfigured || !supabase) {
      setError("Configure o Supabase no .env.local para continuar.");
      return;
    }

    if (!password || !confirmPassword) {
      setError("Preencha a nova senha.");
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas precisam ser iguais.");
      return;
    }

    setError("");
    setMessage("");
    setSubmitting(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(authErrorMessage(updateError.message));
      setSubmitting(false);
      return;
    }

    setMessage("Senha atualizada.");
    setSubmitting(false);
    onPasswordUpdated?.();
  }

  async function handleResendConfirmation() {
    if (!supabase || !isValidEmail(email) || !isAllowedEmailDomain(email)) return;

    setError("");
    setMessage("");
    setSubmitting(true);

    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: normalizeEmail(email),
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (resendError) {
      setError(authErrorMessage(resendError.message));
    } else {
      setMessage("Enviamos um novo link de confirmacao.");
      setCanResendConfirmation(false);
    }

    setSubmitting(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (isRecoverRequest) {
      await handleResetRequest();
      return;
    }

    if (isRecoverUpdate) {
      await handlePasswordUpdate();
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setError("Configure o Supabase no .env.local para continuar.");
      return;
    }

    if (!email || !password || (isRegister && !confirmPassword)) {
      setError("Preencha todos os campos.");
      return;
    }

    if (!isValidEmail(email)) {
      setError("Informe um e-mail valido.");
      return;
    }

    if (!isAllowedEmailDomain(email)) {
      setError("Use um e-mail Gmail, Hotmail ou Outlook.");
      return;
    }

    if (isRegister && password !== confirmPassword) {
      setError("As senhas precisam ser iguais.");
      return;
    }

    const normalizedEmail = normalizeEmail(email);
    setEmail(normalizedEmail);
    setError("");
    setMessage("");
    setCanResendConfirmation(false);
    setSubmitting(true);

    try {
      if (remember) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, normalizedEmail);
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
      }

      if (isLogin) {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (signInError) {
          setError(authErrorMessage(signInError.message));
          setCanResendConfirmation(
            signInError.message.toLowerCase().includes("email not confirmed")
          );
          return;
        }

        onComplete?.(data.session);
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (signUpError) {
        setError(authErrorMessage(signUpError.message));
        return;
      }

      if (data.session) {
        onComplete?.(data.session);
        return;
      }

      setMessage("Conta criada. Confirme seu e-mail para entrar.");
      setCanResendConfirmation(true);
      setMode("login");
      setPassword("");
      setConfirmPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-screen" aria-label="Acesso ao Flux Time">
      <section className="auth-card">
        <header className="auth-card__header">
          <div className="auth-card__icon">
            <Logo size={34} />
          </div>
          <span className="auth-card__name">FLUX TIME</span>
          <span className="auth-card__tagline">Foco, pausas e tarefas no seu ritmo.</span>
        </header>

        {!isRecoverUpdate ? (
          <div className="auth-card__tabs" role="tablist" aria-label="Tipo de acesso">
            <button
              type="button"
              role="tab"
              aria-selected={isLogin}
              className={`auth-card__tab${isLogin ? " is-active" : ""}`}
              onClick={() => changeMode("login")}
            >
              Entrar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isRegister}
              className={`auth-card__tab${isRegister ? " is-active" : ""}`}
              onClick={() => changeMode("register")}
            >
              Registrar-se
            </button>
          </div>
        ) : (
          <p className="auth-card__subtitle">Defina sua nova senha.</p>
        )}

        <form className="auth-form" ref={formRef} onSubmit={handleSubmit}>
          {!isRecoverUpdate ? (
            <label className="auth-field">
              <Mail size={18} strokeWidth={2.25} />
              <input
                type="email"
                value={email}
                placeholder="E-mail"
                autoComplete="email"
                onBlur={(event) => setEmail(normalizeEmail(event.target.value))}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
          ) : null}

          {!isRecoverRequest ? (
            <label className="auth-field">
              <Lock size={18} strokeWidth={2.25} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                placeholder={isRecoverUpdate ? "Nova senha" : "Senha"}
                autoComplete={isLogin ? "current-password" : "new-password"}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="auth-field__toggle"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? (
                  <EyeOff size={18} strokeWidth={2.25} />
                ) : (
                  <Eye size={18} strokeWidth={2.25} />
                )}
              </button>
            </label>
          ) : null}

          {isRegister || isRecoverUpdate ? (
            <label className="auth-field">
              <Lock size={18} strokeWidth={2.25} />
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                placeholder={isRecoverUpdate ? "Confirmar nova senha" : "Confirmar senha"}
                autoComplete="new-password"
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
              <button
                type="button"
                className="auth-field__toggle"
                aria-label={showConfirm ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showConfirm}
                onClick={() => setShowConfirm((value) => !value)}
              >
                {showConfirm ? (
                  <EyeOff size={18} strokeWidth={2.25} />
                ) : (
                  <Eye size={18} strokeWidth={2.25} />
                )}
              </button>
            </label>
          ) : null}

          {isLogin ? (
            <div className="auth-options">
              <label className="auth-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                />
                <span>Lembrar-me</span>
              </label>

              <button
                type="button"
                className="auth-resend auth-resend--forgot"
                disabled={submitting}
                onClick={() => {
                  changeMode("recover-request");
                }}
              >
                Esqueci minha senha
              </button>
            </div>
          ) : null}

          {isRecoverRequest ? (
            <button
              type="button"
              className="auth-resend"
              disabled={submitting}
              onClick={() => {
                changeMode("login");
              }}
            >
              Voltar para entrar
            </button>
          ) : null}

          {error ? <p className="auth-form__error">{error}</p> : null}
          {message ? <p className="auth-form__message">{message}</p> : null}
          {canResendConfirmation ? (
            <button
              type="button"
              className="auth-resend"
              disabled={submitting}
              onClick={handleResendConfirmation}
            >
              Reenviar confirmacao
            </button>
          ) : null}

          <button type="submit" className="auth-submit" disabled={submitting}>
            {submitting
              ? "Aguarde"
              : isRecoverRequest
                ? "Enviar link"
                : isRecoverUpdate
                  ? "Atualizar senha"
                  : isLogin
                    ? "Acessar"
                    : "Criar conta"}
            {!submitting && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" aria-hidden="true">
                <path d="M5 12h14"/>
                <path d="m13 6 6 6-6 6"/>
              </svg>
            )}
          </button>
        </form>
      </section>
    </main>
  );
}
