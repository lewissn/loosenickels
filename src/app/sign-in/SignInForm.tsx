"use client";

import { useActionState } from "react";
import { requestLink, type SignInState } from "./actions";
import s from "./sign-in.module.css";

const initial: SignInState = { status: "idle" };

export function SignInForm() {
  const [state, submit, pending] = useActionState(requestLink, initial);

  if (state.status === "sent") {
    return (
      <p className={s.sent}>
        A link is on its way to <span className={s.address}>{state.email}</span>.
        It will work once, and only for an hour.
      </p>
    );
  }

  return (
    <form action={submit} className={s.form} noValidate>
      <label className={s.label} htmlFor="email">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        className={s.field}
        autoComplete="email"
        autoCapitalize="off"
        spellCheck={false}
        required
        aria-describedby={state.status === "idle" ? undefined : "sign-in-problem"}
      />

      <button type="submit" className={s.submit} disabled={pending}>
        <span className={s.submitText}>{pending ? "Sending" : "Send a link"}</span>
      </button>

      {state.status !== "idle" && (
        <p id="sign-in-problem" className={s.problem} role="alert">
          {state.status === "invalid"
            ? "That does not look like an email address."
            : "The link could not be sent. Try again in a moment."}
        </p>
      )}
    </form>
  );
}
