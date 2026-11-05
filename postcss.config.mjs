/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
    // 2026-11-05 旧端末対応: Tailwind v4 は全スタイルを CSS カスケードレイヤー
    //   (@layer) に入れて出力する。@layer は Safari 15.4 未満の古い iPadOS が
    //   非対応で、未対応ブラウザは @layer ブロックを丸ごと無視するため「全スタイルが
    //   効かず画面が崩れる」状態になる(本番で古い iPad で発生)。このプラグインが
    //   @layer を展開(フラット化)し、レイヤー順を詳細度で再現するので、@layer
    //   非対応ブラウザでもスタイルが当たる。新しいブラウザでの表示結果は変わらない。
    '@csstools/postcss-cascade-layers': {},
  },
}

export default config
