// Login page: POST /api/v1/auth/login → stores session cookie (httpOnly).
export default function LoginPage() {
  return `<form method="post" action="/api/v1/auth/login"><input name="email" autocomplete="username"/><input name="password" type="password"/><button>Entrar</button></form>`;
}
