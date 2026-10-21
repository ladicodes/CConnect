"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "@/app/admin/actions";
import { AlertIcon } from "@/components/icons";

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {});
  const error = state.error ?? notice;
  return (
    <form action={action} className="space-y-5" noValidate>
      {error && (
        <div role="alert" className="alert alert-error">
          <AlertIcon />
          <p>{error}</p>
        </div>
      )}
      <div>
        <label htmlFor="email" className="field-label">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          className="field"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
        />
      </div>
      <div>
        <label htmlFor="password" className="field-label">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
      </div>
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Signing in…
          </>
        ) : (
          "Sign in"
        )}
      </button>
    </form>
  );
}
