import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";
import { validateEmail, validatePassword } from "./validation";

export function SignInForm() {
  const { signIn, pending } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [passwordError, setPasswordError] = useState<string | undefined>(undefined);

  function handleEmailChange(value: string) {
    setEmail(value);
    if (emailError) {
      setEmailError(validateEmail(value));
    }
  }

  function handlePasswordChange(value: string) {
    setPassword(value);
    if (passwordError) {
      setPasswordError(validatePassword(value));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextEmailError = validateEmail(email);
    const nextPasswordError = validatePassword(password);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);

    if (nextEmailError || nextPasswordError) {
      return;
    }

    void signIn(email, password);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => handleEmailChange(event.target.value)}
        />
        {emailError && <span role="alert">{emailError}</span>}
      </div>
      <div>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => handlePasswordChange(event.target.value)}
        />
        {passwordError && <span role="alert">{passwordError}</span>}
      </div>
      <button type="submit" disabled={pending}>
        Sign in
      </button>
    </form>
  );
}
