# 🦖 Dino Rush Online

Chrome の「インターネット未接続」恐竜ゲームをベースにした、スマホ向けのマルチプレイゲームです。

- **レース**：障害物をジャンプ・しゃがみでよけ続ける（だんだん速くなる）
  - ソロ：スコアをサーバーに保存してランキング（24時間 / 7日間 / 全期間）
  - マルチ：おじゃまアイテムで妨害しあうサバイバル。最後の 1 人が勝ち
- **バトル**：マリオブラザーズ風。操作は移動・ジャンプ・かむ。攻撃は相手の頭の「ふみつけ」（踏まれると約1秒気絶）と、ボタンで出す「かみつき」（HP が減るほど遠くへ吹っ飛ぶ）の2つ。体がぶつかっただけではダメージにならず、はじかれる。台の上に出るアイテムボックス（バリア・サボテン・プテラ・おにく）あり。ルーム設定でチーム戦（赤・青の2チーム、味方への攻撃なし）も選べる。画面の左右はつながっている。HP 0 か床の穴に落ちると脱落、最後の 1 人が勝ち
- ルームを作ってコード（4文字）や招待リンクで参加。公開ルーム一覧あり
- CPU を追加できるので 1 人でもマルチの動作確認ができる
- 縦画面 / 横画面どちらにも対応（バトルは横画面がおすすめ）

## ローカルで動かす

```bash
npm install
npm start        # http://localhost:3000
npm test         # シミュレーションとサーバーのテスト
```

同じ Wi-Fi のスマホからは `http://<PCのIPアドレス>:3000` で開けます。

## 構成

```
server/            Node.js サーバー（HTTP + WebSocket を同じポートで提供）
  index.js         エントリーポイント
  http.js          静的ファイル配信・ランキング API
  lobby.js         接続管理・ルーム作成/参加
  room.js          ルーム（設定・準備・CPU・開始/終了）
  race-game.js     マルチレースの進行（脱落順・アイテム中継・CPU）
  battle-game.js   バトルの進行（サーバー権威のシミュレーション）
  storage.js       スコア保存（PostgreSQL / JSON ファイル）
shared/            クライアントとサーバーで共有するゲームロジック
  config.js        ルーム設定の定義・共通定数
  race-sim.js      レースの物理・障害物生成（シード付きで全員同じコース）
  battle-sim.js    バトルの物理・攻撃・ステージ定義
  race-bot.js / battle-bot.js   CPU の思考
public/            クライアント（ビルド不要の ES Modules）
  js/main.js       画面遷移・ロビー UI
  js/race-client.js / battle-client.js   各モードの描画と入力
  js/controls.js   タッチ操作（ボタン / フローティングスティック）+ キーボード
  js/sprites.js    ドット絵（文字列で定義）
tests/             node:test によるテスト
```

### 通信の考え方

| モード | 方式 | 理由 |
| --- | --- | --- |
| レース | 各端末が自分のコースをシミュレートし、状態（高さ・スコア）を 15Hz で共有。サーバーは脱落順とアイテムを管理 | ジャンプの反応速度が最重要なので、通信遅延の影響を受けない方式 |
| バトル | 自分の恐竜は各端末で即座に動かし、位置を 30Hz で送信。攻撃は攻撃した側の画面で判定し、サーバーが距離・無敵時間をチェックして HP を確定。他プレイヤーは 50ms 遅れで補間表示（届かないときは速度で先読み）。CPU はサーバーで計算 | 自分の操作に通信遅延が一切乗らないことを最優先にした方式 |

全員のコースは同じシードから生成されます。おじゃまで送られた障害物は別リストで管理しているので、妨害を受けてもコースはずれません。

### WebSocket メッセージ（`/ws`、JSON）

- クライアント → サーバー：`hello` `listRooms` `createRoom` `joinRoom` `leaveRoom` `setReady` `updateRoom` `addBot` `removePlayer` `startGame` `chat` `race:state` `race:dead` `race:item` `battle:state` `battle:hit` `ping`
- サーバー → クライアント：`welcome` `roomList` `roomState` `leftRoom` `error` `gameStart` `race:players` `race:attack` `race:itemUsed` `race:eliminated` `battle:snapshot` `battle:hit` `gameOver` `chat` `pong`

### REST API

- `GET /api/ranking?period=day|week|all&limit=50&pid=...`
- `POST /api/score` `{ pid, name, score, duration }`（経過時間から出せないスコアは拒否、IP ごとに 10 回/分まで）
- `GET /api/stats` / `GET /healthz`

## クラウドへのデプロイ（GitHub 連携）

GitHub Pages は静的ファイルしか置けず、WebSocket サーバーを動かせません。
そのため **GitHub にリポジトリを置き、GitHub と連携したクラウド（Render）で自動デプロイ** する構成にしています。

1. GitHub にリポジトリを作って push
   ```bash
   git remote add origin https://github.com/<you>/dino-rush.git
   git push -u origin main
   ```
2. ランキング用 DB を用意（無料枠でOK）：[Neon](https://neon.tech) か [Supabase](https://supabase.com) で PostgreSQL を作り、接続文字列をコピー
3. [Render](https://render.com) → **New → Blueprint** → GitHub リポジトリを選択（`render.yaml` が読み込まれる）
4. 環境変数 `DATABASE_URL` に 2. の接続文字列を設定 → デプロイ
5. 以降は `main` に push するたびに自動デプロイ。GitHub Actions（`.github/workflows/ci.yml`）でテストも自動実行

注意点：
- Render の無料プランは 15 分アクセスがないとスリープし、次のアクセスで起動に 30 秒ほどかかります
- `DATABASE_URL` を設定しない場合は `data/scores.json` に保存されますが、無料クラウドでは再起動で消えます
- Fly.io / Railway / Cloud Run などを使う場合は `Dockerfile` を利用できます
- クライアントだけ GitHub Pages に置く場合は `public/js/config.js` の `SERVER_URL` にサーバーの URL を設定し、`public/` と `shared/` を同じ階層に並べて配置してください

## 調整しやすいパラメータ

- レースの速度・重力・障害物の間隔：`shared/race-sim.js` の `RACE` / `OBSTACLES`
- バトルの移動・ジャンプ（`JUMPS`：今は 1 段。2 にすると 2 段ジャンプ）・攻撃の威力/吹っ飛び：`shared/battle-sim.js` の `BATTLE`
- ステージの足場・穴の位置：`shared/battle-sim.js` の `STAGE`
- ルーム設定の選択肢（人数・ライフ・HP・制限時間）：`shared/config.js` の `SETTING_DEFS`

## 今後の拡張アイデア

- 再接続時にルームへ復帰（今は切断するとルームから外れる）
- バトル：POW ブロックのようなギミック、複数ステージ、不正対策（位置の移動速度チェック）
- 通信：WebRTC（UDP）にすると TCP の再送待ちによるカクつきをさらに減らせる
- レース：観戦時に他プレイヤー視点へ切り替え、スキン（帽子など）
- ランキングの不正対策強化（入力ログをサーバーで再生して検証する等）、NG ワードフィルタ
- クイックマッチ（自動マッチング）、フレンド機能、チャットスタンプ
- PWA のオフライン対応（ソロはオフラインでも遊べるように）
