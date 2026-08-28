"use client";

import { useActionState, useEffect, useState } from "react";
import { requestLink, type SignInState } from "./actions";
import s from "./sign-in.module.css";

const initial: SignInState = { status: "idle" };

export function SignInForm() {
  const [state, submit, pending] = useActionState(requestLink, initial);

  if (state.status === "sent") {
    return (
      <div className={s.sent}>
        <p>
          A link is on its way to{" "}
          <span className={s.address}>{state.email}</span>. It will work once,
          and only for an hour.
        </p>
        {/* Said to everybody, every time, because it is true of everybody:
            it describes the archive's sending allowance, not this address.
            Somebody who has waited ten minutes for an email needs to know
            this is a thing that happens, and what to do about it. */}
        <p className={s.aside}>
          Only a few links can be sent each hour. If one does not arrive,
          check the spam folder before asking again — a second request spends
          another of them.
        </p>
      </div>
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

      <button
        type="submit"
        className={s.submit}
        disabled={pending || state.status === "waiting"}
      >
        <span className={s.submitText}>
          {pending ? "Sending" : "Send a link"}
        </span>
      </button>

      {state.status !== "idle" && (
        <p id="sign-in-problem" className={s.problem} role="alert">
          {state.status === "invalid" &&
            "That does not look like an email address."}
          {state.status === "failed" &&
            "The link could not be sent. Try again in a moment."}
          {state.status === "waiting" && <Countdown from={state.seconds ?? 0} />}
        </p>
      )}
    </form>
  );
}

/**
 * The wait, counted down rather than stated once.
 *
 * A number that does not move is indistinguishable from a page that has
 * stopped working, and the whole reason this message exists is that people
 * cannot otherwise tell those two apart.
 */
function Countdown({ from }: { from: number }) {
  const [left, setLeft] = useState(from);

  useEffect(() => {
    setLeft(from);
    if (from <= 0) return;
    const tick = setInterval(
      () => setLeft((n) => (n <= 1 ? 0 : n - 1)),
      1000,
    );
    return () => clearInterval(tick);
  }, [from]);

  if (left <= 0) return <>You can ask for another link now.</>;

  return (
    <>
      A link was just requested. You can ask for another in {left} second
      {left === 1 ? "" : "s"}.
    </>
  );
}
