import { LoginScreen } from "@/components/login-screen"

/**
 * 2026-11-06: トップ(/)と同じログイン画面を表示する。
 * /admin/login・/teacher/login・/patient/login からの 301 転送先でもある(next.config.mjs)。
 */
export default function LoginPage() {
  return <LoginScreen />
}
