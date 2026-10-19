// みんなでポンコツペイント（サーバーとブラウザで共通）
// 2〜8人。描く人は「直線」と「円」しか使えないポンコツなお絵かきでお題を描き、ほかの人は早い者勝ちで答える。
// 部屋の設定で「フリーハンド」モードにすると、ペンで自由に描ける（直線と円も使える）。
// 流れ: お題選び（描く人が3つから選ぶ）→ お絵かき（制限時間）→ 答え発表 → 次の人へ。全員が決められた回数描いたら終了。
// 点数: 正解した人は早い順に 10・8・6・5・4・3・2・1 点、描いた人は正解者1人につき 3 点。誰も正解できなかったら描いた人は -5 点。
// 「描く人固定」モードでは、開始時のホストがずっと描く（描く回数×5問）。
// 時間切れ・全員正解・答え発表の切り替えはサーバーが tick() で行う（state.tickAt の時刻）。
// 手: { pick: 0〜2 } お題を選ぶ / { shape: { type: 'line'|'circle', x1, y1, x2, y2 } } 描く（座標は 0〜1000 × 0〜750）
//     フリーハンドでは { shape: { type: 'path', pts: [[x, y], ...] } } も描ける
//     消しゴムはどちらの描き方でも使える { shape: { type: 'erase', pts: [[x, y], ...] } }（背景の色で太くなぞる）
//     { undo: true } 1つ戻す / { clear: true } 全部消す / { giveUp: true } 描くのをあきらめる / { guess: '答え' } / { resign: true }
export const id = 'paint';
export const title = 'みんなでポンコツペイント';
export const sideNames = Array.from({ length: 8 }, (_, i) => `プレイヤー${i + 1}`);
export const minPlayers = 2;
export const maxPlayers = 8;
export const lobbyReturn = true;
export const logTitle = 'ログ';
export const WIDTH = 1000;
export const HEIGHT = 750;
export const MAX_SHAPES = 300;
export const MAX_PATH_POINTS = 400;   // 1本の線の点の数
export const MAX_TOTAL_POINTS = 30000; // 絵全体の点の数（送るデータが大きくなりすぎないように）
export const CHOOSE_MS = 20000;
export const REVEAL_MS = 6000;
export const GUESS_POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
export const PAINTER_POINTS = 3;
export const NO_ANSWER_PENALTY = 5;
export const FIXED_ROUNDS_PER_TURN = 5; // 描く人固定のときの「描く回数」1つあたりの問題数

// お題（「表示|読み|別の答え…」。どれを答えても正解）
const THEMES = `
犬|いぬ|ドッグ
猫|ねこ|ネコ
うさぎ|ウサギ|兎
ぞう|象|ゾウ
キリン|きりん
ライオン
パンダ
ペンギン
へび|蛇|ヘビ
かめ|亀|カメ
かえる|蛙|カエル
魚|さかな|サカナ
くじら|鯨|クジラ
たこ|蛸|タコ
かに|蟹|カニ
ちょうちょ|蝶|ちょう|チョウ
鳥|とり|トリ
ふくろう|梟|フクロウ
にわとり|鶏|ニワトリ
ぶた|豚|ブタ
うし|牛|ウシ
うま|馬|ウマ
さる|猿|サル
くま|熊|クマ
ねずみ|鼠|ネズミ
かたつむり|カタツムリ|蝸牛
クモ|くも|蜘蛛
はち|蜂|ハチ
イルカ|いるか
サメ|さめ|鮫
ワニ|わに|鰐
ラクダ|らくだ|駱駝
ひつじ|羊|ヒツジ
クラゲ|くらげ
てんとう虫|てんとうむし|テントウムシ
雪だるま|ゆきだるま
りんご|林檎|リンゴ
バナナ
ぶどう|葡萄|ブドウ
スイカ|すいか|西瓜
いちご|苺|イチゴ
みかん|蜜柑|ミカン
さくらんぼ|サクランボ
パイナップル|パイン
おにぎり|おむすび
ラーメン
ピザ
ハンバーガー
ドーナツ
ケーキ|ショートケーキ
アイスクリーム|アイス|ソフトクリーム
すし|寿司
目玉焼き|めだまやき
パン|食パン|しょくぱん
だんご|団子|三色団子|さんしょくだんご
とうもろこし|トウモロコシ|コーン
にんじん|人参|ニンジン
トマト
きのこ|キノコ|茸
ドーナツ|どーなつ
ペロペロキャンディ|ぺろぺろきゃんでぃ|キャンディ|あめ|飴
傘|かさ|カサ
めがね|眼鏡|メガネ
時計|とけい|トケイ
電話|でんわ|固定電話
スマホ|スマートフォン|携帯電話|けいたい
テレビ
パソコン|ノートパソコン|PC
いす|椅子|イス
机|つくえ|テーブル
ベッド
ドア|扉|とびら
窓|まど
鍵|かぎ|カギ
はさみ|ハサミ|鋏
えんぴつ|鉛筆|エンピツ
本|ほん|ノート
はし|箸|おはし
スプーン
フォーク
コップ|グラス
なべ|鍋|ナベ
フライパン
カメラ
ギター
ピアノ
太鼓|たいこ|ドラム
ボール|サッカーボール
バット|野球のバット
ラケット|テニスラケット
指輪|ゆびわ|リング
王冠|おうかん|かんむり|冠
リボン
ぼうし|帽子|ボウシ
くつ|靴|クツ
Tシャツ|ティーシャツ|シャツ
てぶくろ|手袋|テブクロ
かばん|鞄|カバン|バッグ
風船|ふうせん
電球|でんきゅう|ライト
ろうそく|蝋燭|ロウソク
はしご|梯子|ハシゴ
ハンマー|かなづち|金づち|とんかち
ほうき|箒|ホウキ
バケツ
扇風機|せんぷうき
冷蔵庫|れいぞうこ
トイレ|便器
おふろ|風呂|お風呂|ふろ
歯ブラシ|はぶらし
鏡|かがみ|ミラー
ロボット
手紙|てがみ|封筒|ふうとう
プレゼント|ギフト
トロフィー|優勝カップ
メダル|金メダル
信号|しんごう|信号機
車|くるま|自動車|じどうしゃ
自転車|じてんしゃ|チャリ
電車|でんしゃ|列車
新幹線|しんかんせん
飛行機|ひこうき
ヘリコプター|ヘリ
船|ふね|ボート|ヨット
ロケット
バス
トラック
パトカー
救急車|きゅうきゅうしゃ
消防車|しょうぼうしゃ
家|いえ|おうち|うち
お城|しろ|城|おしろ
学校|がっこう
病院|びょういん
東京タワー|タワー|とうきょうたわー
橋|はし|ブリッジ
ピラミッド
神社|じんじゃ|鳥居|とりい
観覧車|かんらんしゃ
すべり台|すべりだい|滑り台
ブランコ|ぶらんこ
テント
太陽|たいよう|お日さま|おひさま
月|つき|三日月|みかづき
星|ほし|スター
雲|くも
雨|あめ
虹|にじ
かみなり|雷|カミナリ
雪|ゆき
山|やま
海|うみ
川|かわ
木|き|樹|じゅもく
花|はな
ひまわり|向日葵|ヒマワリ
チューリップ
さくら|桜|サクラ
葉っぱ|はっぱ|葉
火山|かざん
島|しま|無人島|むじんとう
地球|ちきゅう
火|ひ|炎|ほのお
目|め
手|て
足|あし
耳|みみ
口|くち
歯|は
骨|ほね
顔|かお|笑顔|えがお
忍者|にんじゃ
王様|おうさま|キング
おばけ|お化け|幽霊|ゆうれい
宇宙人|うちゅうじん|エイリアン
魔法使い|まほうつかい|魔女|まじょ
サンタクロース|サンタ
サッカー
野球|やきゅう
テニス
ボウリング
すもう|相撲
スキー
釣り|つり
花火|はなび
ハート
ダイヤモンド|ダイヤ|宝石|ほうせき
お金|おかね|コイン|硬貨
宝箱|たからばこ
地図|ちず
カレンダー
はがき|ハガキ|葉書
ゲーム機|げーむき|ゲーム
メガホン
虫めがね|むしめがね|ルーペ
望遠鏡|ぼうえんきょう
ほうれんそう|ほうれん草
ソーセージ|ウインナー
かぼちゃ|南瓜|カボチャ
なす|茄子|ナス
レモン|れもん
もも|桃|モモ
くり|栗|クリ
えだまめ|枝豆|エダマメ
ぎょうざ|餃子|ギョウザ
たこ焼き|たこやき
カレーライス|カレー
オムライス
ホットケーキ|パンケーキ
プリン
ポップコーン
ワイン|ワイングラス
ジュース
コーヒー|コーヒーカップ
ティーポット|急須|きゅうす
ふとん|布団|フトン
まくら|枕|マクラ
カーテン
電子レンジ|でんしれんじ|レンジ
洗濯機|せんたくき
ドライヤー
テレビゲーム|コントローラー
リモコン
ヘッドホン|ヘッドフォン
マイク
ラジオ
スピーカー
ゴミ箱|ごみばこ|ゴミばこ
つみき|積み木|ツミキ
けん玉|けんだま|ケンダマ
こま|独楽|コマ
サイコロ|さいころ|ダイス
トランプ
凧|たこあげ|凧揚げ
シャボン玉|しゃぼんだま
砂時計|すなどけい
ちょうちん|提灯
こいのぼり|鯉のぼり
クリスマスツリー|ツリー
かがみもち|鏡餅
だるま|達磨|ダルマ
かかし|案山子|カカシ
UFO|ユーフォー|未確認飛行物体
潜水艦|せんすいかん
気球|ききゅう|熱気球
パラシュート
エスカレーター
エレベーター
踏切|ふみきり
灯台|とうだい
風車|ふうしゃ|かざぐるま
噴水|ふんすい
ベンチ
ポスト|郵便ポスト
自動販売機|じどうはんばいき|自販機
きつね|狐|キツネ
たぬき|狸|タヌキ
りす|栗鼠|リス
しか|鹿|シカ
コアラ
カンガルー
ゴリラ
シマウマ|しまうま|縞馬
サイ|さい|犀
カバ|かば|河馬
ラッコ
アザラシ|あざらし
ペリカン
つる|鶴|ツル
はと|鳩|ハト
すずめ|雀|スズメ
からす|烏|カラス
とんぼ|蜻蛉|トンボ
せみ|蝉|セミ
カブトムシ|かぶとむし
クワガタ|くわがた
ほたる|蛍|ホタル
いもむし|芋虫|イモムシ|青虫|あおむし
みみず|蚯蚓|ミミズ
ひよこ|ヒヨコ
うなぎ|鰻|ウナギ
えび|海老|エビ
ほたて|帆立|ホタテ|貝|かい
ヒトデ|ひとで|海星
イカ|いか|烏賊
金魚|きんぎょ
恐竜|きょうりゅう|ティラノサウルス
ドラゴン|竜|りゅう
ユニコーン
人魚|にんぎょ|マーメイド
かっぱ|河童|カッパ
メロン
キウイ|キウイフルーツ
なし|梨|ナシ
かき|柿|カキ
アボカド
ブロッコリー
キャベツ
たまねぎ|玉ねぎ|タマネギ
じゃがいも|ジャガイモ|ポテト
さつまいも|サツマイモ|焼き芋|やきいも
しいたけ|椎茸|シイタケ
焼き鳥|やきとり
ステーキ|肉|にく
エビフライ
フライドポテト
ホットドッグ
サンドイッチ
お弁当|べんとう|弁当
うどん|そば|蕎麦
焼きそば|やきそば
お好み焼き|おこのみやき
クッキー
チョコレート|チョコ
マカロン
かき氷|かきごおり
わたあめ|綿あめ|綿菓子|わたがし
牛乳|ぎゅうにゅう|ミルク
お茶|おちゃ|緑茶|湯のみ|ゆのみ
掃除機|そうじき
体温計|たいおんけい
注射|ちゅうしゃ|注射器
包丁|ほうちょう
まな板|まないた
炊飯器|すいはんき
トースター
石けん|せっけん|石鹸
シャンプー
タオル
ハンガー
洗濯ばさみ|せんたくばさみ
ランドセル
リュック|リュックサック
財布|さいふ
定規|じょうぎ|ものさし
消しゴム|けしごむ
ホッチキス|ホチキス
クリップ
画びょう|がびょう
地球儀|ちきゅうぎ
黒板|こくばん
鉄棒|てつぼう
跳び箱|とびばこ
縄跳び|なわとび
一輪車|いちりんしゃ
スケートボード|スケボー
浮き輪|うきわ
水着|みずぎ
サングラス
懐中電灯|かいちゅうでんとう
救急箱|きゅうきゅうばこ
消火器|しょうかき
目覚まし時計|めざましどけい
植木鉢|うえきばち|鉢植え|はちうえ
じょうろ|ジョウロ
スコップ|シャベル
のこぎり|鋸|ノコギリ
ペンチ
ねじ|ネジ
くぎ|釘|クギ
電池|でんち|乾電池
コンセント|プラグ
電卓|でんたく
腕時計|うでどけい
ネックレス
口紅|くちべに
香水|こうすい
長靴|ながぐつ
スリッパ
げた|下駄
着物|きもの
マント
仮面|かめん|お面|おめん
いかだ|筏
カヌー
戦車|せんしゃ
馬車|ばしゃ
人力車|じんりきしゃ
三輪車|さんりんしゃ
交番|こうばん
郵便局|ゆうびんきょく
動物園|どうぶつえん
水族館|すいぞくかん
遊園地|ゆうえんち
ジェットコースター
メリーゴーランド
公園|こうえん
砂場|すなば
ビル|高層ビル|こうそうびる
工場|こうじょう
牧場|ぼくじょう
田んぼ|たんぼ
井戸|いど
線路|せんろ
横断歩道|おうだんほどう
流れ星|ながれぼし
竜巻|たつまき
台風|たいふう
氷|こおり
つらら|氷柱
雪の結晶|ゆきのけっしょう
砂漠|さばく
サボテン
ヤシの木|やしのき
もみじ|紅葉|こうよう|カエデ
どんぐり|ドングリ
たけのこ|筍|タケノコ
竹|たけ
洞窟|どうくつ
湖|みずうみ
波|なみ
結婚式|けっこんしき
運動会|うんどうかい
誕生日|たんじょうび|バースデー
雪合戦|ゆきがっせん
綱引き|つなひき
かくれんぼ
ジャンケン|じゃんけん
握手|あくしゅ
お辞儀|おじぎ
寝坊|ねぼう|居眠り|いねむり
くしゃみ
あくび
ダンス|踊り|おどり
マラソン
水泳|すいえい
バスケットボール|バスケ
バレーボール|バレー
ゴルフ
卓球|たっきゅう|ピンポン
柔道|じゅうどう
のり|糊|ノリ
セロハンテープ|セロテープ|テープ
輪ゴム|わごむ
安全ピン|あんぜんぴん
マスク
ネクタイ
スカート
靴下|くつした|ソックス
サンダル
マフラー
浴衣|ゆかた
歯みがき粉|はみがきこ|歯磨き粉
トイレットペーパー
ティッシュ|ティッシュペーパー
アイロン
やかん|ヤカン|薬缶
おたま|お玉|オタマ
菜箸|さいばし
茶碗|ちゃわん|お茶碗|おちゃわん
お皿|おさら|皿|さら
ストロー
水筒|すいとう
天ぷら|てんぷら|天麩羅
味噌汁|みそしる|お味噌汁|おみそしる
納豆|なっとう
卵|たまご|玉子|タマゴ
チーズ
バター
せんべい|煎餅|おせんべい|センベイ
パフェ
ピーマン
きゅうり|胡瓜|キュウリ
大根|だいこん|ダイコン
チョーク
筆箱|ふでばこ|ペンケース
絵の具|えのぐ
クレヨン
色鉛筆|いろえんぴつ
バイオリン|ヴァイオリン
トランペット|ラッパ|らっぱ
カスタネット
リコーダー|たて笛|たてぶえ
木琴|もっきん|シロフォン
絆創膏|ばんそうこう|バンドエイド
車いす|くるまいす|車椅子
自動ドア|じどうどあ
階段|かいだん
コンビニ|コンビニエンスストア
駐車場|ちゅうしゃじょう
ガソリンスタンド
シーソー
ローラースケート
ぬいぐるみ|縫いぐるみ|ヌイグルミ
人形|にんぎょう
水鉄砲|みずでっぽう
虫取り網|むしとりあみ|虫とり網|網|あみ
アリ|あり|蟻
バッタ|ばった
カマキリ|かまきり
ツバメ|つばめ|燕
アヒル|あひる
白鳥|はくちょう|ハクチョウ
フラミンゴ
オウム|おうむ|インコ
ハムスター
モグラ|もぐら
トラ|とら|虎
オオカミ|おおかみ|狼
サンゴ|さんご|珊瑚
`.trim().split('\n').map((line) => line.split('|').map((x) => x.trim()).filter(Boolean));
// むずかしいお題（形が複雑なもの・目に見えないもの）
const HARD_THEMES = `
自由の女神|じゆうのめがみ
エッフェル塔|えっふぇるとう
ピサの斜塔|ぴさのしゃとう|斜塔
スフィンクス
モアイ|モアイ像|もあいぞう
大仏|だいぶつ|奈良の大仏
金閣寺|きんかくじ
東京スカイツリー|スカイツリー|すかいつりー
富士山|ふじさん
モナリザ|モナ・リザ
ムンクの叫び|叫び|さけび|むんくのさけび
考える人|かんがえるひと
招き猫|まねきねこ|マネキネコ
こけし|コケシ
ひな人形|ひなにんぎょう|雛人形|おひなさま|お雛様
門松|かどまつ
蚊取り線香|かとりせんこう
流しそうめん|ながしそうめん
盆踊り|ぼんおどり
将棋|しょうぎ
カメレオン
ハリネズミ|はりねずみ
ナマケモノ|なまけもの
タツノオトシゴ|たつのおとしご
カモノハシ|かものはし
アルマジロ
ミイラ|みいら
雪女|ゆきおんな
ゾンビ
宇宙飛行士|うちゅうひこうし
オーロラ
ブラックホール
日食|にっしょく|皆既日食|かいきにっしょく
地震|じしん
蜃気楼|しんきろう
化石|かせき|アンモナイト
方位磁石|ほういじしゃく|コンパス|方位磁針|ほういじしん
天秤|てんびん|はかり
万華鏡|まんげきょう
ルービックキューブ
黒電話|くろでんわ
公衆電話|こうしゅうでんわ
お化け屋敷|おばけやしき
回転寿司|かいてんずし|回転ずし
満員電車|まんいんでんしゃ
渋滞|じゅうたい|交通渋滞
停電|ていでん
静電気|せいでんき
筋肉痛|きんにくつう
時差ぼけ|じさぼけ
迷子|まいご
一目惚れ|ひとめぼれ|一目ぼれ
二日酔い|ふつかよい
金縛り|かなしばり
既読無視|きどくむし|既読スルー|きどくするー
手品|てじな|マジック
綱渡り|つなわたり
福笑い|ふくわらい
冬眠|とうみん
脱皮|だっぴ
ドミノ倒し|どみのだおし|ドミノ
引っ越し|ひっこし
ダイエット
リバウンド
筋トレ|きんとれ|筋力トレーニング
反抗期|はんこうき
走馬灯|そうまとう
光合成|こうごうせい
重力|じゅうりょく|万有引力|ばんゆういんりょく
指紋|しもん
`.trim().split('\n').map((line) => line.split('|').map((x) => x.trim()).filter(Boolean));

// 有名なキャラクター
const CHARACTER_THEMES = `
ミッキーマウス|ミッキー|みっきー
ミニーマウス|ミニー|みにー
ドナルドダック|ドナルド
ドラえもん|どらえもん
のび太|のびた|野比のび太|のびのびた
アンパンマン|あんぱんまん
ばいきんまん|バイキンマン
ピカチュウ|ぴかちゅう|ピカチュー
ハローキティ|キティちゃん|キティ
スヌーピー
くまのプーさん|プーさん|ぷーさん
マリオ|スーパーマリオ
ルイージ
ヨッシー
星のカービィ|カービィ|カービー
ソニック
パックマン
スライム
トトロ|となりのトトロ
孫悟空|悟空|ごくう|そんごくう
ルフィ|モンキー・D・ルフィ
うずまきナルト|ナルト
江戸川コナン|コナン|名探偵コナン
野原しんのすけ|しんちゃん|クレヨンしんちゃん|しんのすけ
ちびまる子ちゃん|まる子|まるこ
サザエさん|さざえさん
とっとこハム太郎|ハム太郎|はむたろう
リラックマ
ぐでたま
くまモン|くまもん
ふなっしー
ガチャピン
ゴジラ
ウルトラマン
仮面ライダー|かめんらいだー
ゲゲゲの鬼太郎|鬼太郎|きたろう
目玉おやじ|めだまおやじ
鉄腕アトム|アトム
白雪姫|しらゆきひめ
シンデレラ
ピノキオ
ピーターパン
エルサ|アナと雪の女王|アナ雪
スティッチ
バズ・ライトイヤー|バズ
ウッディ
ニモ|ファインディング・ニモ|カクレクマノミ
ミニオン|ミニオンズ
スパイダーマン
バットマン
スーパーマン
ハリー・ポッター|ハリーポッター|ハリポタ
ダース・ベイダー|ダースベイダー
ヨーダ
ムーミン
ミッフィー
ペコちゃん|ぺこちゃん
カーネル・サンダース|カーネルサンダース|ケンタッキーのおじさん
桃太郎|ももたろう
金太郎|きんたろう
浦島太郎|うらしまたろう
一寸法師|いっすんぼうし
かぐや姫|かぐやひめ
天狗|てんぐ
`.trim().split('\n').map((line) => line.split('|').map((x) => x.trim()).filter(Boolean));

// THEME_LIST[i] = [表示, 別の答え…]、THEME_TAGS[i] = '' / 'hard'（むずかしい）/ 'chara'（キャラクター）
const ALL_THEMES = [
  ...THEMES.map((t) => [t, '']), ...HARD_THEMES.map((t) => [t, 'hard']), ...CHARACTER_THEMES.map((t) => [t, 'chara']),
].filter(([[w]], i, arr) => arr.findIndex(([[x]]) => x === w) === i);
export const THEME_LIST = ALL_THEMES.map(([t]) => t);
export const THEME_TAGS = ALL_THEMES.map(([, tag]) => tag);
export const TAG_NAMES = { hard: 'むずかしい', chara: 'キャラ' };

// 答えの比べ方: 全角/半角・カタカナ/ひらがな・大文字/小文字・空白の違いは無視
export function normalizeAnswer(text) {
  return String(text || '').normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s・。、！？!?.,]/g, '');
}

// 描き方: 'ponkotsu' = 直線と円だけ / 'free' = フリーハンド（直線と円も使える）
export const MODES = { ponkotsu: 'ポンコツ（直線と円）', free: 'フリーハンド' };

export function normalizeOptions(o) {
  const turns = [1, 2, 3].includes(Number(o && o.turns)) ? Number(o.turns) : 1;
  const seconds = [60, 90, 120].includes(Number(o && o.seconds)) ? Number(o.seconds) : 90;
  const mode = o && o.mode === 'free' ? 'free' : 'ponkotsu';
  const painter = o && o.painter === 'fixed' ? 'fixed' : 'rotate';
  return { turns, seconds, mode, painter };
}
// 描く人: 'rotate' = 順番に交代 / 'fixed' = ホストが固定で描く
export const PAINTER_MODES = { rotate: '順番に交代', fixed: '固定（ホスト）' };
export const variantName = (o) => {
  const x = normalizeOptions(o);
  const rounds = x.painter === 'fixed' ? `描く人固定・${x.turns * FIXED_ROUNDS_PER_TURN}問` : `${x.turns}周`;
  return `${x.mode === 'free' ? 'フリーハンド・' : ''}${rounds}・${x.seconds}秒`;
};

function shuffle(arr, rng) {
  const rand = rng ? (n) => rng(n) - 1 : (n) => Math.floor(Math.random() * n);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const label = (seat) => `P${seat + 1}`;
const active = (s) => [...Array(s.players).keys()].filter((p) => !s.out[p]);

export function init(options, players = 2, rng, ctx) {
  const opts = normalizeOptions(options);
  const fixed = opts.painter === 'fixed';
  const host = ctx && ctx.hostSeat >= 0 && ctx.hostSeat < players ? ctx.hostSeat : 0;
  const s = {
    players, options: opts, out: Array(players).fill(false), scores: Array(players).fill(0),
    deck: shuffle(THEME_LIST.map((_, i) => i), rng), round: 0,
    totalRounds: fixed ? opts.turns * FIXED_ROUNDS_PER_TURN : players * opts.turns,
    fixedPainter: fixed ? host : -1, painter: -1, phase: 'choose', choices: [], theme: null, shapes: [], feed: [], correct: [],
    endsAt: null, tickAt: null, turn: 0, result: null, history: [],
  };
  startRound(s, rng);
  return s;
}

function drawTheme(s, rng) {
  if (!s.deck.length) s.deck = shuffle(THEME_LIST.map((_, i) => i), rng);
  return s.deck.pop();
}

// むずかしいお題を1つ山から抜き出す（山になければ山を作り直す）
function drawHard(s, rng) {
  let i = s.deck.findLastIndex((t) => THEME_TAGS[t] === 'hard');
  if (i < 0) {
    s.deck = shuffle(THEME_LIST.map((_, k) => k), rng);
    i = s.deck.findLastIndex((t) => THEME_TAGS[t] === 'hard');
  }
  return s.deck.splice(i, 1)[0];
}

function startRound(s, rng) {
  s.round += 1;
  // 描く人は順番に（抜けた人は飛ばす）。固定モードは同じ人（その人が抜けたら次の人が引き継ぐ）
  let p = s.fixedPainter;
  if (p < 0 || s.out[p]) {
    p = p < 0 ? s.painter : p;
    do p = (p + 1) % s.players; while (s.out[p]);
    if (s.fixedPainter >= 0) s.fixedPainter = p;
  }
  s.painter = p;
  s.turn = p;
  s.phase = 'choose';
  // 3つのうち1つは必ずむずかしいお題（並び順はばらばら）
  s.choices = shuffle([drawHard(s, rng), drawTheme(s, rng), drawTheme(s, rng)], rng);
  s.theme = null;
  s.shapes = [];
  s.feed = [];
  s.correct = [];
  s.penalty = 0;
  s.endsAt = Date.now() + CHOOSE_MS;
  s.tickAt = s.endsAt;
  s.history.push(`第${s.round}/${s.totalRounds}ラウンド：${label(p)} が描きます`);
}

function startDrawing(s, choice) {
  s.theme = s.choices[choice];
  s.choices = [];
  s.phase = 'draw';
  s.endsAt = Date.now() + s.options.seconds * 1000;
  s.tickAt = s.endsAt;
}

function endRound(s, reason) {
  s.phase = 'reveal';
  s.endsAt = Date.now() + REVEAL_MS;
  s.tickAt = s.endsAt;
  s.history.push(`${reason}。答えは「${THEME_LIST[s.theme][0]}」（正解 ${s.correct.length}人）`);
  // 誰も分からなかったら描いた人は減点（抜けた人は除く）
  s.penalty = 0;
  if (!s.correct.length && !s.out[s.painter]) {
    s.penalty = NO_ANSWER_PENALTY;
    s.scores[s.painter] -= NO_ANSWER_PENALTY;
    s.history.push(`誰も正解できなかったので ${label(s.painter)} は -${NO_ANSWER_PENALTY}点`);
  }
}

// 答え発表になった絵を履歴（ギャラリー）用に取り出す。サーバーが保存する
export function archive(s) {
  if (s.phase !== 'reveal' || s.theme === null || !s.shapes.length) return null;
  return {
    key: s.round, theme: THEME_LIST[s.theme][0], tag: THEME_TAGS[s.theme], painter: s.painter, mode: s.options.mode,
    shapes: s.shapes, correct: s.correct.slice(), guessers: active(s).filter((p) => p !== s.painter).length,
  };
}

function finishGame(s) {
  s.phase = 'end';
  s.tickAt = null;
  s.endsAt = null;
  const live = active(s);
  const best = Math.max(...live.map((p) => s.scores[p]));
  const top = live.filter((p) => s.scores[p] === best);
  s.result = top.length === 1 ? { winner: top[0], reason: `${best}点` } : { winner: null, reason: `${best}点で同点` };
}

// 時間切れ・答え発表の終わり
export function tick(s, rng) {
  const ns = clone(s);
  if (s.phase === 'choose') { startDrawing(ns, 0); return ns; }
  if (s.phase === 'draw') { endRound(ns, '時間切れ'); return ns; }
  if (s.phase === 'reveal') {
    if (ns.round >= ns.totalRounds || active(ns).length < 2) finishGame(ns);
    else startRound(ns, rng);
    return ns;
  }
  return { ...s, tickAt: null };
}

export const canActOutOfTurn = () => true;

// お題は描く人だけ（答え発表のあとは全員）。正解の答えはほかの人に見せない
export function viewFor(s, seat) {
  const open = s.phase === 'reveal' || s.phase === 'end';
  const painter = seat === s.painter;
  return {
    ...s,
    deck: null,
    choices: painter ? s.choices.map((i) => THEME_LIST[i][0]) : s.choices.map(() => '？'),
    choiceTags: painter ? s.choices.map((i) => THEME_TAGS[i]) : s.choices.map(() => ''),
    theme: s.theme === null ? null : open || painter || s.correct.includes(seat) ? THEME_LIST[s.theme][0] : null,
    themeLength: s.theme === null ? 0 : [...THEME_LIST[s.theme][0]].length,
    feed: s.feed.map((f) => (f.correct && !open && f.seat !== seat && !painter ? { ...f, text: null } : f)),
  };
}

export function phaseText(s, you) {
  if (s.result) return null;
  const painter = you === s.painter;
  if (s.phase === 'choose') return painter ? 'お題を3つから選んでください' : 'お題を選んでいます…';
  if (s.phase === 'draw') {
    if (painter) return s.options.mode === 'free' ? 'フリーハンドでお題を描こう！' : '直線と円だけでお題を描こう！';
    if (s.correct.includes(you)) return '正解！ ほかの人を待っています';
    return you >= 0 ? '絵を見て答えを入力しよう！' : 'お絵かき中…';
  }
  if (s.phase === 'reveal') return '答え発表！ まもなく次のラウンド';
  return null;
}

export const scoreOf = (s, seat) => `${s.scores[seat]}点`;

const clone = (s) => ({
  ...s, out: s.out.slice(), scores: s.scores.slice(), deck: s.deck.slice(), choices: s.choices.slice(),
  shapes: s.shapes.slice(), feed: s.feed.slice(), correct: s.correct.slice(), history: s.history.slice(),
});

const num = (x, max) => Math.max(0, Math.min(max, Math.round(Number(x) || 0)));

export function applyMove(s, mv, seat, rng) {
  if (s.result) throw new Error('ゲームは終了しています');
  mv = mv || {};
  if (s.out[seat]) throw new Error('抜けています');
  const ns = clone(s);
  const painter = seat === s.painter;

  if (mv.resign) {
    ns.out[seat] = true;
    ns.history.push(`${label(seat)} が抜けました`);
    if (active(ns).length < 2) { finishGame(ns); return ns; }
    if (painter && (s.phase === 'choose' || s.phase === 'draw')) {
      if (s.phase === 'choose') startDrawing(ns, 0);
      endRound(ns, '描く人が抜けました');
    } else if (s.phase === 'draw') {
      const guessers = active(ns).filter((p) => p !== ns.painter);
      if (guessers.every((p) => ns.correct.includes(p))) endRound(ns, '全員正解');
    }
    return ns;
  }

  if (mv.pick != null) {
    if (!painter || s.phase !== 'choose') throw new Error('今はお題を選べません');
    const i = Number(mv.pick);
    if (!(i in s.choices)) throw new Error('お題を選んでください');
    startDrawing(ns, i);
    return ns;
  }

  if (mv.shape || mv.undo || mv.clear || mv.giveUp) {
    if (!painter || s.phase !== 'draw') throw new Error('今は描けません');
    if (mv.giveUp) { endRound(ns, '描く人がギブアップ'); return ns; }
    if (mv.undo) { ns.shapes.pop(); return ns; }
    if (mv.clear) { ns.shapes = []; return ns; }
    const sh = mv.shape;
    if (ns.shapes.length >= MAX_SHAPES) throw new Error(`これ以上描けません（${MAX_SHAPES}個まで）`);
    if (sh.type === 'path' || sh.type === 'erase') {
      if (sh.type === 'path' && s.options.mode !== 'free') throw new Error('直線と円しか描けません');
      const pts = Array.isArray(sh.pts) ? sh.pts.slice(0, MAX_PATH_POINTS).map((p) => [num(p && p[0], WIDTH), num(p && p[1], HEIGHT)]) : [];
      if (pts.length < 2) throw new Error('線が短すぎます');
      const used = ns.shapes.reduce((a, x) => a + (x.pts ? x.pts.length : 2), 0);
      if (used + pts.length > MAX_TOTAL_POINTS) throw new Error('これ以上描けません。「1つ戻す」か「全部消す」をしてください');
      ns.shapes.push({ type: sh.type, pts });
      return ns;
    }
    if (sh.type !== 'line' && sh.type !== 'circle') throw new Error('直線と円しか描けません');
    ns.shapes.push({ type: sh.type, x1: num(sh.x1, WIDTH), y1: num(sh.y1, HEIGHT), x2: num(sh.x2, WIDTH), y2: num(sh.y2, HEIGHT) });
    return ns;
  }

  if (mv.guess != null) {
    if (s.phase !== 'draw') throw new Error('今は答えられません');
    if (painter) throw new Error('描く人は答えられません');
    if (s.correct.includes(seat)) throw new Error('もう正解しています');
    const text = String(mv.guess).trim().slice(0, 30);
    if (!text) return s;
    const ok = THEME_LIST[s.theme].some((a) => normalizeAnswer(a) === normalizeAnswer(text));
    ns.feed.push({ seat, text, correct: ok });
    if (ns.feed.length > 80) ns.feed.shift();
    if (ok) {
      const pts = GUESS_POINTS[Math.min(ns.correct.length, GUESS_POINTS.length - 1)];
      ns.correct.push(seat);
      ns.scores[seat] += pts;
      ns.scores[ns.painter] += PAINTER_POINTS;
      ns.history.push(`${label(seat)} 正解！（+${pts}）`);
      const guessers = active(ns).filter((p) => p !== ns.painter);
      if (guessers.every((p) => ns.correct.includes(p))) endRound(ns, '全員正解');
    }
    return ns;
  }
  throw new Error('不明な操作です');
}
