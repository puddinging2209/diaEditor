# Railway Timetable Studio

架空鉄道のダイヤ・車両運用を編集するプログレッシブウェブアプリです。

## 鉄道ダイヤ・運用コア

鉄道データ処理ロジックは `src/core/` と `src/railway/` に分離しています。

- `src/core/types.ts`: 駅・路線・列車・運用の型定義
- `src/core/oud2Parser.ts`: ライセンスフリーの OuDia / OuDiaSecond テキスト形式および XML 取込
- `src/core/operationEngine.ts`: 併結対応の運用割り当て API
- `src/railway/operationEngine.ts`: 折り返し、併結・分割を含む運用割り当て実装
- `src/railway/types.ts`: 共有型への互換エクスポート
- `patternGenerator.ts`: 相対時刻の展開と列車番号採番
- `validator.ts`: ホーム・単線・両数・運用接続の検証
- `io.ts` / `persistence.ts`: JSON 入出力と IndexedDB 保存
- `src/core/fixtures/mobile-demo.oud2`: UI 連携のサンプルダイヤ

検証やテストは `npm run typecheck`、`npm test` で実行できます。単線区間と列車の想定両数はデータ型に項目がないため、`validateRailway` の `singleTrackLineIds` / `expectedCarCounts` オプションで指定します。運用割り当て時の新規編成両数は `defaultCarCount` で指定でき、既定値は 1 両です。

## モバイル編集と .oud2 取込

`src/core/` は共有型、運用割り当て、`.oud2` 取込を提供します。OuDia / OuDiaSecond の標準テキスト形式と XML 形式に対応し、UTF-8・UTF-16・Shift-JIS のファイルを読み込めます。2駅未満にしか時刻がない列車は読み飛ばし、他の有効な列車を取り込みます。モバイル向けのダイヤ・紙面形式の時刻表・列車時刻編集・運用カード画面は `src/components/railway/` にあり、ダイヤは横スワイプ、ピンチズーム、スジのドラッグ調整に対応しています。停車は到着から発車までの水平線で表現します。起動時には `src/core/fixtures/mobile-demo.oud2` のサンプルが読み込まれます。

画面スタイルには Tailwind CSS と追加のモバイル向けスタイルを利用しています。時刻欄は数字6桁（`101015` = `10:10:15`）で入力でき、ダイヤのスジをタップすると着発時刻を編集できます。サイドバー、モバイル下部ナビゲーション、コマンドパレットの `railway.` コマンドから、ダイヤ・紙の時刻表・列車時刻・車両運用を切り替えられます。

## 開発コマンド

- `npm run dev`: ローカル開発サーバー
- `npm run build`: PWA 本番ビルド
- `npm run typecheck`: TypeScript 型検査
- `npm test`: コアロジックのテスト
