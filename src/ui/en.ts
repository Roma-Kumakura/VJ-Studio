/** English UI dictionary: Japanese UI text → English. Used by i18n.ts in English mode. */
export const EN: Record<string, string> = {
  // ---------------------------------------------------------------- top bar / common
  '曲が読み込まれていません': 'No song loaded',
  '元に戻す': 'Undo', '元に戻す (⌘Z)': 'Undo (⌘Z)', 'やり直す': 'Redo', 'やり直す (⇧⌘Z)': 'Redo (⇧⌘Z)',
  '元に戻しました': 'Undone', 'やり直しました': 'Redone',
  'チュートリアル': 'Tutorial', '使い方のツアー': 'Guided tour',
  'ショートカット一覧 (?)': 'Keyboard shortcuts (?)', 'ショートカット': 'Shortcuts', '⌨️ ショートカット': '⌨️ Shortcuts',
  'しくみ（About）': 'How it works (About)', 'しくみ': 'How it works', 'しくみ ↗': 'How it works ↗', 'しくみを読む': 'Read how it works',
  'リセット': 'Reset', 'すべて消してトップページに戻る': 'Erase everything and go back to the top page',
  'スロットで丸ごと自動生成 (R)': 'Generate everything with the slot machine (R)',
  '🎲 おまかせ': '🎲 Auto', '書き出し': 'Export', '書き出し →': 'Export →',
  'キャンセル': 'Cancel', '閉じる': 'Close', '削除': 'Delete', '外す': 'Remove', 'なし': 'None', '自動': 'Auto', '任意': 'optional',
  'プレビューの要素はクリックで選択、ドラッグで移動、ホイール／ピンチでサイズ変更': 'Click an element in the preview to select it, drag to move, scroll / pinch to resize',
  '小節移動': 'Jump a bar', '再生': 'Play',
  'すべてを初期化してトップページに戻りますか？ 曲・写真・動画・アイコン・歌詞・テロップ・すべての設定が消えます（元に戻せません）。':
    'Reset everything and go back to the top page? Your song, photos, videos, icon, lyrics, captions and all settings will be erased (this cannot be undone).',
  'すべて初期化する': 'Reset everything',

  // ---------------------------------------------------------------- start / landing page
  '使いみち': 'Use cases', 'FOR DTMers ・ 同人音楽': 'FOR BEDROOM PRODUCERS ・ INDIE MUSIC',
  '自作曲を、': 'Turn your track', 'SNSに出せるVJ映像に。': 'into a VJ video for social media.',
  '曲を入れるだけで、音に合わせて動く映像ができます。スペアナなどのメーター、自分の写真や動画、テロップ、歌詞も自由に載せられます。DAWの画面録画の代わりに、あなただけの映像で新曲を届けましょう。':
    'Drop in a song and get visuals that move with the music. Add meters like a spectrum analyzer, your own photos and videos, captions and lyrics. Share your new track with a video that is truly yours — not a screen recording of your DAW.',
  '🎲 おまかせで数秒、こだわるなら細かく作り込み': '🎲 Done in seconds with Auto — or fine-tune every detail',
  '📤 YouTube・X・Instagram・TikTok 向けにMP4書き出し': '📤 MP4 export for YouTube, X, Instagram and TikTok',
  '🔒 AIは使わず、曲や画像はブラウザの外に出ません': '🔒 No AI — your song and images never leave the browser',
  '▶ デモ曲でチュートリアルを見る': '▶ Take the tutorial with a demo song',
  'はじめる': 'Get started', 'はじめる →': 'Start →',
  '曲をドロップ': 'Drop your song', '（必須）': '(required)',
  'wav / mp3 / m4a / flac。Sunoのmp3なら曲名・ジャケット・歌詞も読み取ります。': 'wav / mp3 / m4a / flac. Suno mp3s also bring their title, cover art and lyrics.',
  '写真や動画もまとめてここに入れてOK': 'You can drop photos and videos here too',
  'アイコン': 'Icon', 'SNSのアイコン画像（任意）': 'Your social media icon (optional)',
  '写真・動画': 'Photos & videos', '映像に使う素材（任意・複数OK）': 'Material for the video (optional, multiple OK)',
  '曲や画像はこのブラウザの中だけで処理され、どこにも送信されません。': 'Your song and images are processed only in this browser and are never uploaded.',
  'デコード中…': 'Decoding…', '解析中…': 'Analyzing…', '解析中…（BPM・展開・帯域）': 'Analyzing… (BPM, structure, bands)', 'BPM・展開を判定中…': 'Detecting BPM and structure…',
  '曲を入れる': 'Add a song', 'BPM・展開（イントロ／ビルド／ドロップ）を自動で解析します。': 'BPM and structure (intro / build / drop) are analyzed automatically.',
  'おまかせ or 作り込み': 'Auto or hands-on', '🎲で丸ごと自動生成。左の要素リストから歌詞・テロップ・メーターなどをすぐ編集。': '🎲 generates everything at once. Edit lyrics, captions, meters and more right from the element list on the left.',
  'SNS向けに書き出す': 'Export for social media', '投稿先を選ぶだけで、画面の形・画質・長さがそろいます。': 'Pick where you will post and the shape, quality and length are set for you.',
  'こんな時に使えます': 'When to use it',
  '新曲の告知': 'New release', '新作をSNSで告知するときに': 'Announcing a new release',
  '完成した新曲のサビ30〜60秒に、ジャケット・曲名・「12.24 配信」のようなテロップを載せ、メーターが音に合わせて動く映像に。DAWの画面録画より、ずっと「作品」らしく届けられます。':
    'Put your cover art, the title and a caption like “Out 12.24” over 30–60 seconds of the chorus, with meters moving to the music. It feels like a real release — far more than a DAW screen recording.',
  'スケッチ・作業中': 'Sketches & WIP', 'ちょっとしたスケッチを、すぐ投稿': 'Post a quick sketch right away',
  '作りかけのループや思いつきのフレーズも、🎲おまかせを回せば数秒で映像に。毎回ちがう組み合わせが出るので、気軽に何度でもSNSに上げられます。':
    'Even an unfinished loop or a phrase you just came up with becomes a video in seconds with 🎲 Auto. Every spin is a new combination, so you can post as often as you like.',
  '自分だけのMV': 'Your own MV', '写真や動画で、自分だけの1本を': 'Make a one-of-a-kind video with your photos and clips',
  '撮りためた写真・動画を背景やカードにして、歌詞を流し、フォント・色・エフェクトまで作り込み。テーマを使わず素材だけで作ることも。縦型にすればリールやTikTokにも。':
    'Use your photos and clips as the background or as cards, run the lyrics, and fine-tune fonts, colors and effects. You can even skip themes and use only your own material. Go vertical for Reels and TikTok.',
  'VJ STUDIO ・ ブラウザだけで動くVJ映像ジェネレーター ・': 'VJ STUDIO ・ a VJ video generator that runs entirely in your browser ・',
  'この音声ファイルは読み込めませんでした': 'This audio file could not be loaded',

  // ---------------------------------------------------------------- layer list / pages
  '映像の要素': 'Video elements', '🎲 おまかせで作る': '🎲 Auto-generate',
  '曲': 'Song', '背景': 'Background', '文字・アイコン': 'Text & icon', 'メーター': 'Meters', '仕上げ': 'Finishing',
  'おまかせ': 'Auto', '曲・BPM': 'Song & BPM', 'テーマ・シーン': 'Themes & scenes', '曲名・@名前': 'Title & @name', '歌詞': 'Lyrics', 'テロップ': 'Captions',
  'スペアナ': 'Spectrum', '波形': 'Waveform', '位相': 'Phase', 'BPM・時間': 'BPM & time', 'エフェクト・色': 'Effects & color',
  '表示する': 'Show', '隠す': 'Hide', '素材だけ': 'Media only', 'スーパースロット': 'Super Slot', '(空)': '(empty)',
  '画面に表示する': 'Show on screen',

  // ---------------------------------------------------------------- song page
  '曲の読み込みとBPM': 'Loading the song and BPM', 'いまの曲': 'Current song', 'BPMを補正': 'Correct BPM', '適用': 'Apply',
  'DnBなどで半分/倍のテンポで検出されたときに使います。ビートや展開の判定が更新されます。': 'Use this when the tempo was detected at half or double (common with DnB). Beats and structure are re-detected.',
  '別の曲に変更': 'Change song', '🎵 曲をドロップ / クリックで選択': '🎵 Drop a song / click to choose',
  'プレビュー画質': 'Preview quality', '軽い': 'Light', '標準': 'Standard', '高': 'High', '最高': 'Best',
  '重いときは「軽い」に。書き出しの画質には影響しません。': 'Choose “Light” if it runs slowly. This does not affect export quality.',
  'イントロ/ブレイク': 'Intro / break', 'ビルド': 'Build', 'ドロップ': 'Drop', 'アウトロ': 'Outro',

  // ---------------------------------------------------------------- theme page
  '映像のベースを選ぶ': 'Choose the base of the video', '画面の形': 'Screen shape', '横 16:9': 'Landscape 16:9', '正方形 1:1': 'Square 1:1', '正方形': 'Square', '縦 9:16': 'Portrait 9:16',
  '横はX・YouTube、正方形はX・インスタ、縦はリール・TikTok・ショート向け。': 'Landscape for X and YouTube, square for X and Instagram, portrait for Reels, TikTok and Shorts.',
  '🎬 素材だけで作る（テーマを使わない）': '🎬 Media only (no themes)',
  '背景はすべて自分の写真・動画になり、テーマは一切使いません。拍に合わせて素材が切り替わります（切り替え間隔と動きは「写真動画」タブで調整）。':
    'The whole background is your own photos and videos, with no themes at all. Your material switches on the beat (set the interval and motion on the Photos & videos page).',
  '「写真動画」タブで素材を追加すると、素材だけの映像になります': 'Add material on the Photos & videos page to make a media-only video',
  'シーン切替': 'Scene switching', '曲の展開に合わせてテーマを切り替える': 'Switch themes with the song structure', '切替の細かさ': 'How often', '展開ごと': 'Per section', '4〜8小節': 'Every 4–8 bars',
  '🎲 シーンを組み直す（🔒は残す）': '🎲 Rebuild scenes (keeps 🔒)',
  'シーンをクリック（タイムラインの SCENE 帯でもOK）→ 下のテーマカードで差し替え。境目はタイムライン上でドラッグできます。': 'Click a scene (or the SCENE lane on the timeline) → swap it with a theme card below. Drag the boundaries on the timeline.',
  'このシーンへの切り替え方': 'Transition into this scene', '固定（組み直しても変わらない）': 'Locked (kept when rebuilding)',
  'テーマ1つだけのモードにしました（シーンを選ぶとそのシーンだけ変えられます）': 'Switched to single-theme mode (select a scene to change just that scene)',
  'テーマ': 'Theme', 'すべて': 'All', 'シーン': 'Scene', 'シーン ·': 'scenes ·',
  'カット': 'Cut', 'クロスフェード': 'Crossfade', 'フラッシュ': 'Flash', 'ズーム': 'Zoom', 'グリッチ': 'Glitch', 'ワイプ': 'Wipe',
  '🎲 ランダムに生成し直す': '🎲 Regenerate randomly', 'シード #': 'Seed #', '（同じ番号なら同じ映像になります）': '(the same number gives the same video)',
  '動きと色': 'Motion & color', '反応の強さ': 'Reactivity', 'スピード': 'Speed', '色相シフト': 'Hue shift',

  // ---------------------------------------------------------------- media page
  '自分の素材で個性を出す': 'Make it yours with your own material',
  '📷 写真・🎬 動画をドロップ / クリックで追加（複数OK）': '📷 Drop photos / 🎬 videos or click to add (multiple OK)', '📷 写真・🎬 動画をドロップ（複数OK）': '📷 Drop photos / 🎬 videos (multiple OK)',
  '複数入れると拍に合わせて切り替わるスライドショーになります。素材はこのブラウザ内だけで使われ、保存はされません。': 'Several items become a slideshow that switches on the beat. Your material is used only in this browser and is not saved.',
  '見せ方': 'Display', '表示': 'Show as', '3Dカード': '3D card', 'オフ': 'Off', '合成': 'Blend', 'スクリーン': 'Screen', '加算': 'Add', 'オーバーレイ': 'Overlay', '通常': 'Normal',
  '切り替え': 'Switch every', '2拍': '2 beats', '1小節': '1 bar', '2小節': '2 bars', '4小節': '4 bars', '8小節': '8 bars',
  'テーマの重なり': 'Theme overlay', '動き': 'Motion', '3Dカードの配置': '3D card placement', '傾き': 'Tilt', 'なじませ': 'Blend in',
  '0%で枠つきのカード、上げるほど縁がぼけて背景の色や光と混ざります。': 'At 0% it is a framed card; higher values soften the edges and mix it with the colors and light behind it.',
  '写真・動画カード': 'Photo / video card',

  // ---------------------------------------------------------------- icon / title
  'SNSのアイコン画像': 'Your social media icon', '画像': 'Image', 'アイコン画像を選ぶ': 'Choose an icon image', '👤 アイコン画像': '👤 Icon image', '画像を選ぶ': 'Choose an image',
  '形と配置': 'Shape & position', '形': 'Shape', '円形': 'Circle', 'エフェクト': 'Effects', 'フィルター': 'Filter', '枠': 'Frame',
  'ビートで脈動': 'Pulse on the beat', '3Dゆらぎ': '3D sway', 'RGBずれ': 'RGB split', '発光': 'Glow',
  '曲のタイトルとSNSのID': 'Song title and your social ID', '文字': 'Text', '曲名': 'Title', '曲のタイトル': 'Song title', '@ユーザー名': '@username', 'アーティスト': 'Artist',
  'フォント': 'Font', '@名前': '@name', '配置': 'Position', '位置': 'Position', 'サイズ': 'Size',
  'ジャケット画像': 'Cover art', '「ジャケット・パルス」で中央に表示されます。': 'Shown in the center by the “Jacket Pulse” theme.',

  // ---------------------------------------------------------------- meters
  '周波数ごとの音量を表示': 'Level per frequency', 'デザイン': 'Design',
  'オシロスコープ（音の波形）': 'Oscilloscope (the waveform)', 'ゴニオメーター（左右の広がり）': 'Goniometer (stereo width)', 'BPM・経過時間・拍のランプ': 'BPM, elapsed time and beat lamps',
  'ウェーブ': 'Wave', 'カプセル': 'Capsules', 'ドットLED': 'Dot LED', 'サークル': 'Circle', '3Dテレイン': '3D terrain',
  'BPM表示': 'BPM readout', '+波形': '+ waveform', '+位相': '+ phase',

  // ---------------------------------------------------------------- lyrics
  'コピペで流し込むだけ': 'Just paste them in', '歌詞を表示': 'Show lyrics',
  'Sunoの歌詞をそのまま貼り付けOK。[Verse] [Chorus] などのタグをブロックとして読み取り、ビートに合わせて自動で割り当てます。LRC形式（[00:12.34] 歌詞）ならその時間どおり。':
    'Paste Suno lyrics as they are. Tags like [Verse] and [Chorus] are read as blocks and timed to the beat automatically. LRC files ([00:12.34] line) follow their timestamps.',
  '見た目（定番）': 'Look (classic)', '見た目（ボカロ風モーション）': 'Look (vocal-synth MV motion)',
  'ボカロMVのように、文字が1行ごとに動いて出てきます。スーパースロットでは、これらが1行ごとに入れ替わり、重なり合って表示されます。':
    'Like a vocal-synth music video, each line arrives with its own motion. In Super Slot these change every line and overlap each other.',
  'Apple Music風': 'Apple Music style', 'Spotify風': 'Spotify style', 'カラオケ': 'Karaoke', 'ミニマル': 'Minimal',
  '縦書き': 'Vertical', 'ポップ': 'Pop', 'タイプ': 'Typewriter', '巨大文字': 'Giant type', '散らばり': 'Scatter', '円環': 'Ring', '流れる帯': 'Scrolling band', '切り抜き': 'Cut-outs', '奥から': 'From depth',
  'タイミングを合わせる': 'Timing',
  'いちばん簡単な合わせ方：再生しながら、歌が始まる瞬間ごとに Enter（またはボタン）。その後の行も自動でついてきます。': 'The easiest way: while playing, press Enter (or the button) each time a line starts. The following lines follow automatically.',
  '👆 次の行をいまに合わせる': '👆 Sync the next line to now', '↺ タップを全部消す': '↺ Clear all taps', '次にタップする行：「': 'Next line to tap: “',
  '全体の調整（歌い出し・歌い終わり・ずらし）': 'Overall adjustment (start, end, offset)', '歌い出し': 'Vocals start', '歌い終わり': 'Vocals end', '自動の行をずらす': 'Shift the auto lines',
  '歌詞の進む速さ': 'Lyric speed', '全体の切り替わりが遅い／早いときはここで連続的に調整。ブロックごとの「微調整」で1行の長さ（拍）も細かく変えられます。':
    'If lines change too slowly or too fast overall, adjust it here. “Fine-tune” on each block changes the length of a line (in beats).',
  'ブロックごとの「開始」と「1行の長さ」でもざっくり合わせられます。': 'You can also roughly align with each block’s “Start” and “Line length”.',
  'ここから始まる': 'Starts here', '1行の長さ': 'Line length', '微調整': 'Fine-tune', '拍': 'beats', '−1拍': '−1 beat', '+1拍': '+1 beat', 'いまの位置': 'Current position', '今': 'Now',
  'LRCのタイムスタンプで表示しています。': 'Shown with the LRC timestamps.',
  '行をクリックでその位置へ移動。● はタップで合わせた行（● をクリックで解除）。': 'Click a line to jump there. ● marks lines synced by tapping (click ● to undo).',
  'タップで合わせた行（クリックで解除）': 'Synced by tapping (click to undo)', '歌詞：次の行をいまに合わせる': 'Lyrics: sync the next line to now',
  '[Verse]\n夜の東京を泳いで\n光る街に溶けていく\n\n[Chorus]\nきみに届け…': '[Verse]\nSwimming through Tokyo at night\nMelting into the glowing city\n\n[Chorus]\nLet it reach you…',

  // ---------------------------------------------------------------- captions
  'インスタ風に文字を置く': 'Place text like on Instagram', '＋ いまの位置にテロップを追加': '＋ Add a caption at the playhead',
  'タイムライン下段のピンクの帯がテロップの表示区間です。プレビュー上で直接ドラッグ＆ホイールで調整できます。': 'The bars on the bottom lane of the timeline show when each caption is visible. Drag and scroll on the preview to adjust it.',
  'テキスト': 'Text', 'テキストを入力': 'Enter text', 'スタイル': 'Style', '揃え': 'Align', '左': 'Left', '中央': 'Center', '右': 'Right',
  '表示する時間': 'Visible', '開始〜終了': 'Start – end', '終了を 0 にすると最後まで表示されます。': 'Set the end to 0 to keep it until the end.',
  'シンプル': 'Simple', '背景ボックス': 'Box', 'フチ取り': 'Outline', 'ネオン': 'Neon', 'ドロップシャドウ': 'Drop shadow',
  'フェード': 'Fade', 'ポップイン': 'Pop in', 'タイプライター': 'Typewriter', '拍で跳ねる': 'Bounce on the beat',
  'テロップ「': 'Caption “',

  // ---------------------------------------------------------------- effects & color
  '色とキラキラ': 'Color & sparkle', 'カラープリセット': 'Color presets', 'メイン': 'Main', 'サブ': 'Accent', 'キラキラ': 'Sparkle', 'ブルーム（光のにじみ）': 'Bloom (light glow)', '背景を暗く': 'Darken background',
  'アイコン枠・メーター・キラキラ・テロップ以外の文字色に使われます。テーマ自体の色は「テーマ → 色相シフト」で。': 'Used for the icon frame, meters, sparkle and text other than captions. Change the theme’s own color with Theme → Hue shift.',

  // ---------------------------------------------------------------- auto (slot machine)
  '素材を入れてスピン': 'Add material and spin', '🎰 おまかせ生成': '🎰 Auto-generate', '🎰 スピン！': '🎰 Spin!', 'ロックを全部はずす': 'Unlock all',
  'ロックするとスピンしても変わりません': 'Locked items stay the same when you spin',
  '気に入った項目は 🔒 で固定して、ほかだけ回し直せます。⌘Z で前の結果に戻れます。': 'Lock what you like with 🔒 and re-spin the rest. ⌘Z brings back the previous result.',
  'ムード': 'Mood', 'カラー': 'Color', '素材': 'Material', 'レイアウト': 'Layout',
  '雰囲気': 'Mood', '🎲 曲から判断': '🎲 From the song', 'リキッド': 'Liquid', 'ナイトシティ': 'Night city', 'ドリームコア': 'Dreamcore', 'ハイプ': 'Hype', 'レトロY2K': 'Retro Y2K', 'コズミック': 'Cosmic', '和': 'Japanese',
  'ぶち込む素材': 'Throw in material', 'テロップにしたい言葉を1行ずつ\n例）NEW SINGLE\n12.24 配信\n夜の東京を泳ぐ': 'Words for captions, one per line\ne.g. NEW SINGLE\nOut 12.24\nSwimming through Tokyo at night',
  '曲の展開（サビ頭・切り替わり）に合わせて自動で配置されます。空なら曲名などから自動で作ります。': 'Placed automatically at key moments (chorus starts, changes). Leave empty to build them from the title.',
  '素材はまだありません（なくても生成できます）': 'No material yet (you can generate without it)', '素材なし': 'No material',
  '生成に失敗しました。もう一度スピンしてください': 'Generation failed. Please spin again',
  'いまの配置': 'Current layout', 'センター': 'Center', 'コーナー': 'Corner', 'カード主役': 'Card focus', 'サイドプロフィール': 'Side profile',
  'そのまま': 'Keep', 'ふつう': 'Normal', '控えめ': 'Subtle', 'ド派手': 'Wild', '1小節で切替': 'switch every bar', '2拍で切替': 'switch every 2 beats', '拍で切替': 'switch on the beat',
  '・素材': ' · material', '・動画': ' · video',
  // super slot
  '🌀 スーパースロット': '🌀 Super Slot', 'カオス・ネットワーク': 'chaos network',
  'テーマと写真・動画が「生き物」になります。曲の音をエサとして奪い合い、エサを得たものは変異した子を産み、飢えたものや年老いたものは死んで二度と戻りません。ドロップでは大量絶滅が起こります。世代を重ねるうちに群れは曲に適応し、曲の終わりは始まりとは別の世界になります。':
    'Themes, photos and videos become living things. They compete for the music as food; the well-fed have mutated offspring, the starving and the old die and never return. Drops bring mass extinctions. Over the generations the population adapts to the song, so its end is a different world from its beginning.',
  'スーパースロットモード': 'Super Slot mode', '🌀 カオスを回す': '🌀 Spin the chaos', 'カオス度': 'Chaos', '進化の速さ': 'Evolution speed',
  '写真・動画が多いほどネットワークが育ちます。通常モードに戻すにはスイッチをオフ。': 'More photos and videos make a richer network. Turn the switch off to go back to normal mode.',
  'ネットワークを生成しました': 'Network generated',
  '🧬 生態系の記録': '🧬 Ecosystem record', '写真・動画 ― 平均世代': 'Photos & videos ― mean generation', '大量絶滅 ／ 下段：群れが「聴いている」音': 'mass extinction / bottom: what the population “listens” to',
  '🥁 手動カオス（タップ記録）': '🥁 Manual chaos (tap recording)', '再生しながら下のボタンか': 'While playing, press the button below or',
  'キーを押すと、その瞬間にカオスが総入れ替えされ、時間が記録されます（歌詞のタップと同じ）。曲に合わせて連打してみてください。': 'to replace the whole chaos at that moment; the time is recorded (like lyric taps). Try hammering it in time with the music.',
  '🌀 ここでカオス！': '🌀 Chaos here!', '拍にそろえる': 'Snap to the beat', '最後を取り消す': 'Undo last', 'すべて消す': 'Clear all', 'まだ記録はありません': 'Nothing recorded yet',
  'クリックでこの位置へ／右の×で削除': 'Click to jump here / × to delete',
  '個体数': 'Population', 'ゆらぎ': 'Sway', 'ジャケット': 'Jacket', 'ファイル': 'File', '長さ': 'Length',

  // ---------------------------------------------------------------- export
  'SNSに合わせてMP4を保存': 'Save an MP4 for your platform', 'どこに投稿する？': 'Where will you post?',
  '選ぶと、画面の形・画質・長さがそのSNS向けにそろいます。下で細かく変えることもできます。': 'Picking one sets the shape, quality and length for that platform. You can still change them below.',
  'Instagram リール': 'Instagram Reels',
  '横 16:9・1080p・曲全体': 'Landscape 16:9 · 1080p · whole song', '横 16:9・720p・最大2:20': 'Landscape 16:9 · 720p · up to 2:20',
  '縦 9:16・1080p・サビ60秒': 'Portrait 9:16 · 1080p · 60 s of the chorus', '縦 9:16・1080p・サビ30秒': 'Portrait 9:16 · 1080p · 30 s of the chorus',
  '通常の動画として曲をまるごと。': 'The whole song as a regular video.', '通常アカウントの上限 2分20秒 に収めます。': 'Fits the 2:20 limit of a regular account.',
  'リール向けの縦長。サビの手前から60秒。': 'Vertical for Reels. 60 seconds from just before the chorus.', '縦長・短め。サビの手前から30秒。': 'Vertical and short. 30 seconds from just before the chorus.',
  '画質': 'Quality', 'なめらかさ': 'Frame rate', '書き出す区間': 'Range', 'サビ30秒': 'Chorus 30 s', 'サビ60秒': 'Chorus 60 s', '頭から2:20': 'First 2:20', '曲全体': 'Whole song', 'カスタム': 'Custom',
  '最後をフェードアウト': 'Fade out at the end', '📤 MP4を書き出す': '📤 Export MP4', '⚠️ Xの通常アカウントは2分20秒までです': '⚠️ Regular X accounts are limited to 2:20',
  '✅ このブラウザはコマ落ちなしの高速書き出しに対応しています。': '✅ This browser supports fast, frame-exact export.',
  '⚠️ このブラウザは高速書き出しに非対応のため、リアルタイム録画で書き出します（曲の長さぶん時間がかかります）。PCのChromeがおすすめです。': '⚠️ This browser does not support fast export, so it records in real time (it takes as long as the song). Chrome on a computer is recommended.',
  '📤 書き出し中…': '📤 Exporting…', '準備中…': 'Preparing…', '書き出す区間が短すぎます': 'The range is too short', 'キャンセルしました': 'Cancelled', '書き出しに失敗しました:': 'Export failed:',
  '🎉 できました！（': '🎉 Done! (', '⬇ ダウンロード': '⬇ Download',

  // ---------------------------------------------------------------- keyboard help
  '再生 / 停止': 'Play / stop', '再生 / 停止 (Space)': 'Play / stop (Space)', '1小節もどる / すすむ': 'Back / forward one bar', '4小節もどる / すすむ': 'Back / forward four bars', '曲の先頭へ': 'To the start',
  'おまかせ生成（スピン）': 'Auto-generate (spin)', 'クリック音（拍の確認）': 'Click track (check the beat)', 'クリック音で拍を確認 (M)': 'Check the beat with a click track (M)',
  'スーパースロット：この瞬間にカオスを総入れ替え（記録）': 'Super Slot: replace the chaos at this moment (recorded)',
  '1〜9': '1–9', '左の要素リストを上から選ぶ': 'Pick from the element list on the left, top to bottom', '書き出しを開く': 'Open export', '選択中のテロップを削除': 'Delete the selected caption', '選択を解除': 'Deselect', 'この一覧': 'This list',
  'クリック音 ON（拍が合っているか確認できます）': 'Click track ON (check that the beat lines up)', 'クリック音 OFF': 'Click track OFF',

  // ---------------------------------------------------------------- tour
  'VJ STUDIO へようこそ': 'Welcome to VJ STUDIO', '曲に合わせて動く映像を作るアプリです。': 'This app makes videos that move with your music.',
  'このツアーで、画面の見方と作り方を1分で案内します。': 'This one-minute tour shows you around the screen and how to make a video.',
  '→ キーや Enter でも進めます。': 'You can also use → or Enter.',
  'プレビュー': 'Preview', 'いまの映像です。アイコンやテロップなどの要素は': 'This is your video. Elements such as the icon and captions can be',
  'クリックで選択': 'selected with a click', 'ドラッグで移動': 'moved by dragging', 'ホイール（スマホはピンチ）でサイズ変更': 'resized with the scroll wheel (pinch on phones)', 'できます。': '.',
  '再生とタイムライン': 'Playback & timeline',
  '▶（Space）で再生。波形の色は曲の展開（イントロ・ビルド・ドロップ）です。下の段はシーン（テーマの切り替え）とテロップ。クリックでその位置へ移動します。':
    'Play with ▶ (Space). The waveform colors show the song structure (intro, build, drop). The lower lanes are scenes (theme changes) and captions. Click to jump there.',
  'まずは「おまかせ」': 'Start with “Auto”', '迷ったらここ。スロットを回すと、テーマ・色・配置・フォント・メーターまで': 'Not sure where to start? Spin the slot machine and the theme, colors, layout, fonts and meters are',
  '丸ごと自動で': 'all decided automatically', '決まります（R キー）。気に入った項目は🔒で固定できます。': '(R key). Lock what you like with 🔒.',
  '映像の要素リスト': 'Element list', '映像に使われている要素がすべて並んでいます。': 'Every element of your video is listed here.',
  'クリックするとすぐ右側で編集': 'Click one to edit it right away on the right', 'できます。●を押すと表示／非表示。': '. Press ● to show / hide.',
  '歌詞をコピペで流し込むと、Apple Music のように曲に合わせて流れます。Suno の mp3 なら自動で読み込まれます。': 'Paste your lyrics and they flow with the song like on Apple Music. Suno mp3s are read automatically.',
  '「12.24 配信」「NEW SINGLE」など、好きな文字を好きな時間に。フォントは8種類、アニメーション付き。': 'Any text at any time — “Out 12.24”, “NEW SINGLE”… 8 fonts, with animations.',
  '自分の写真や動画を背景やカードに。テーマを使わず「素材だけ」で作ることもできます。': 'Use your own photos and videos as the background or as cards. You can also make a “media only” video without themes.',
  '設定パネル': 'Settings panel', '左で選んだ要素の設定がここに出ます。いじった結果はすぐプレビューに反映。⌘Z でいつでも元に戻せます。': 'Settings for the element you chose on the left appear here. Changes show in the preview right away. ⌘Z undoes at any time.',
  'YouTube・X・Instagram・TikTok を選ぶだけで、画面の形・画質・長さがそろいます。あとはMP4を保存して投稿するだけ。': 'Just pick YouTube, X, Instagram or TikTok and the shape, quality and length are set. Then save the MP4 and post it.',
  'これで準備完了': 'You are all set', 'ツアーは上の「チュートリアル」からいつでも見直せます。「リセット」はすべて消してトップページに戻ります。': 'Replay this tour any time with “Tutorial” at the top. “Reset” erases everything and returns to the top page.',
  'まずは 🎲おまかせ から始めてみましょう。': 'Try starting with 🎲 Auto.', '← 戻る': '← Back', '次へ →': 'Next →',

  // ---------------------------------------------------------------- data labels (template.ts, fonts, misc)
  'アイコン枠': 'Icon frame', 'BPM・時間表示': 'BPM & time', 'スペクトラムアナライザー': 'Spectrum analyzer',
  'ゴシック': 'Gothic', '丸ゴシック': 'Rounded', '明朝': 'Mincho', 'ドット': 'Pixel', '極太': 'Heavy', '手書きマーカー': 'Marker', 'SF (英数字)': 'Sci-fi (Latin)',
  'モノクロ': 'Mono', 'デュオトーン': 'Duotone', '虹色': 'Rainbow', '枠なし': 'No frame', 'ブロック': 'Block', '回転': 'Spin', 'ボックス/フチ': 'Box / outline',
  'キック': 'Kick', 'スネア': 'Snare', 'ハット': 'Hats', '音量': 'Loudness', '低音': 'Bass', '中音': 'Mids', '高音': 'Highs',
  'ファイルから': 'From the file:', 'を読み込みました': 'loaded', 'を読み込めませんでした': 'could not be loaded', '個を読み込みました': 'loaded',
  '用に設定しました。': 'settings applied.', '」を読み込みました（': '” loaded (',
};

/** dynamic messages (numbers, names) — applied before fragment matching */
export const EN_PATTERNS: [RegExp, string][] = [
  [/(\d+)拍で切替/g, 'switch every $1 beats'],
  [/^背景(?=\s*[・·])/, 'Background'], [/^3Dカード(?=\s*[・·])/, '3D card'], [/^オフ(?=\s*[・·])/, 'Off'],
  [/\s*[・·]\s*なし$/, ' · none'],
  [/^(\S*)\s?和$/, '$1 Japanese'],
  [/^BPM を ([\d.]+) にしました$/, 'BPM set to $1'],
  [/^アイコン(\d)・素材(\d+)個を読み込みました$/, 'Loaded icon: $1 · media: $2'],
  [/^「(.+)」を読み込みました（([\d.]+) BPM）$/, 'Loaded “$1” ($2 BPM)'],
  [/^(.+) を読み込めませんでした$/, 'Could not load $1'],
  [/^ファイルから (.+) を読み込みました$/, 'Read from the file: $1'],
  [/^(.+) 用に設定しました。/, 'Set up for $1. '],
  [/📦 素材 (\d+)個（写真(\d+)・動画(\d+)）/, '📦 Material: $1 ($2 photos · $3 videos)'],
  [/約 (\d+) MB/, 'about $1 MB'],
  [/（テンポのゆれ ±([\d.]+)、拍の位置は自動で追従）/, '(tempo drift ±$1, beats follow automatically)'],
  [/^(\d+)シーン/, '$1 scenes'],
  [/(\d+)個/g, '$1'],
  [/^(\d+)回$/, '$1 taps'],
  [/([\d.]+)拍/g, '$1 beats'],
  [/自動\(/, 'Auto ('],
];
