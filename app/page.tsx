import { LoginScreen } from "@/components/login-screen"

/**
 * 2026-11-06 副田さん要望: トップ画面にログインフォームを直接表示する。
 * 以前は「ログイン画面へ」ボタンだけの中継ページで、ログインまでに 1 クリック余計だった。
 * /login も同じ画面(LoginScreen)を表示する。
 */
export default function HomePage() {
  return <LoginScreen />
}
