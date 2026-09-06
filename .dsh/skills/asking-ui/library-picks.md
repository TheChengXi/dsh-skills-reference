**通用工具（框架无关）**  
- 3D 地球组件：Cobe  
- 动态 OG 图生成器（HTML/CSS → SVG/PNG）：Satori  
- 代码高亮引擎：Shiki  
- 条件类名拼接：clsx  
- 类型安全样式变体：class-variance-authority (cva)  
- 通用图表库：ECharts / Chart.js  
- 通用动画引擎：GSAP / Anime.js  

**React 专属生态**  
- 无样式无障碍原语：Base UI（@mui/base）  
- 命令面板（⌘K 调色板）：cmdk  
- Toast 通知：Sonner  
- 一次性密码输入：input-otp  
- 弹簧/布局动画：motion（Framer Motion）  
- 数字动画：NumberFlow  
- 动画文本：torph  
- 实时流式图表：Liveline  
- 通用图表：recharts  
- 拖拽：dnd-kit  
- 虚拟滚动渲染器：Virtuoso  
- 状态管理：Zustand  
- 主题切换（无闪烁）：next-themes  

**Vue 专属生态**  
- 无样式无障碍原语：Radix Vue / Headless UI (Vue)  
- 命令面板：vue3-cmdk / 自建组合式（VueUse）  
- Toast 通知：vue-toastification / notivue  
- OTP 输入：vue-otp-input  
- 动画：@vueuse/motion / 直接集成 GSAP  
- 数字动画：vue-countup-v3 / useTransition (from @vueuse/core)  
- 动画文本：vue-typewriter / 自定义 CSS 动画  
- 拖拽：vuedraggable (SortableJS) / useDraggable (from @vueuse/core)  
- 虚拟滚动：vue-virtual-scroller / @tanstack/vue-virtual  
- 状态管理：Pinia  
- 主题切换：useDark (from @vueuse/core)  
- 高颜值 PC 端 UI 库：Naive UI, Arco Design Vue, SoybeanUI, Inspira UI, Wave UI  
- 移动端 UI 库：Wot UI (uni-app), NutUI, Varlet, Vant  
- 3D 场景构建（声明式）：TresJS, TroisJS  
- 专业 3D 可视化：lr-map-viewer（三维地图）, vtkviewer-vue（VTK 模型）

**游戏引擎 / 框架**
- Phaser：2D 游戏框架，功能完整，含物理、动画、输入、音频管理
- Babylon.js：3D 游戏引擎，功能全面（内置物理、工具链、WebXR 支持）
- PlayCanvas：3D 游戏引擎，开源，专注浏览器端 3D 内容
- MelonJS：轻量级 2D 游戏引擎
- Excalibur：TypeScript 2D 游戏引擎
- LittleJS：极速轻量级 HTML5 游戏引擎
- Pixalo：基于 Canvas 的 2D 游戏引擎，含粒子发射器系统
- UAP Game Engine：极简 3D 游戏引擎
- Fibbo：开源 Web 游戏引擎
- action-engine-js：抽象游戏样板代码的框架（输入、音频、渲染、物理等）
- ScrubJS：HTML5 游戏库，侧重易学性（游戏循环、精灵、事件、碰撞）
- BlitJS：轻量级 TypeScript 游戏框架，受 Pygame 启发（Surface、Vector2、Rect、Sprite、Scene）
- Litecanvas：超轻量级（~4kb）Canvas 2D 引擎
- Kontra：轻量级游戏微库，为 js13kGames 优化
- Kaplay：JavaScript/TypeScript 游戏库

**3D 图形 / 渲染**
- Three.js：最流行的 WebGL 3D 渲染库
- Babylon.js：功能强大的 WebGL 渲染引擎，微软支持
- Two.js：渲染器无关的 2D 绘图 API
- W.js：超小型（个位数 KB）WebGL 3D 引擎
- regl / luma.gl：WebGL 底层辅助库
- three-cluster-lights：Three.js 高性能集群光照系统（WebAssembly 驱动）
- @cazala/party：高性能 TypeScript 粒子物理引擎（WebGPU + CPU 双运行时）

**2D 渲染**
- Pixi.js：高性能 2D/2.5D 渲染引擎（WebGL + Canvas 回退）
- CreateJS：2D 开发套件（EaselJS 渲染 + TweenJS 动画 + SoundJS 声音 + PreloadJS 加载）

**物理引擎**
- Rapier (rapier2d / rapier3d)：Rust 编写的 2D/3D 物理引擎，提供 JS 绑定
- @nexus-physics/core：高性能 3D 物理引擎（Rust + Rapier3D + WASM）
- physics3d-engine：轻量级 3D 物理引擎（TypeScript，碰撞检测 + 刚体动力学）
- dom-physics：DOM 元素物理引擎（仅操作 transform，不破坏 DOM 层级，框架无关）
- Liko：2D 物理引擎（TypeScript）
- Matter.js：2D 物理引擎（碰撞检测 + 刚体物理）
- Cannon.js / Ammo.js：物理引擎，常与 Babylon.js 集成

**音频**
- Audio Loom (@happy-pixels/audio-loom)：框架无关音频管理库（Web Audio API，支持 3D 音频 PannerNode）
- Star Audio：移动端优先的游戏音频管理器（SFX + BGM 淡入淡出，基于 Howler.js）
- @zakkster/lite-audio-pool：零分配、高性能 Web Audio 系统（实时游戏优化）
- @narraleaf/sound：轻量级 HTML 音频管理方案

**网络 / 多人**
- Socket.IO：WebSocket 实时通信库（自动降级、事件驱动、命名空间）
- netcode：二进制编码 WebSocket 通信系统（服务端/客户端，面向 Web 游戏）
- WsMini：极简 WebSocket 库（RPC、PubSub、房间、游戏状态同步）
- Colyseus：多人游戏状态同步框架

**输入 / 控制**
- Mana Potion：游戏开发工具包（输入响应式 Store、主循环、虚拟摇杆，支持 React/Vue/Svelte）

**动画**
- GSAP：高性能复杂动画引擎
- Anime.js：轻量级 JS 动画引擎
- Mo.js：创意动画库

**粒子系统**
- @zakkster/lite-particles：无头粒子引擎（GC-free 物理、生命周期管理）
- pixi-particle-system：PixiJS 粒子系统
- lite-object-pool：零依赖对象池（O(1) 获取/释放，粒子系统优化）

**游戏 UI**
- @toolcase/game-components：框架无关 Web Components 游戏 UI（HUD、菜单、背包、小地图等 130+ 元素）
- Cosmic UI Lite：轻量级太空主题 UI 组件库（TypeScript + SVG，游戏就绪）
- @moxijs/ui：基于 Pixi.js 的游戏 UI 组件库（主题、布局、表单控件）

**ECS (Entity Component System)**
- MECS (Monomorph ECS)：高性能 TypeScript/JavaScript ECS 库
- entt-js：EnTT 的 TypeScript 移植
- super-ecs：JavaScript/TypeScript ECS 库
- @dacite/ecs：JavaScript/TypeScript ECS 库

**光照 / 阴影**
- kaplay-lighting：KAPLAY 游戏光照插件（点光源、全局光、法线贴图）
- pixijs-light2d：PixiJS v8 2D 光照系统（动态光照、法线贴图、实时阴影）
- light2d：2D 光照系统（全局环境光、点光、聚光）

**3D 地球 / 地理空间**
- CesiumJS：3D 地球和 GIS 数据可视化
- Deck.gl：WebGL 驱动的数据可视化框架（大规模地理空间数据）

**其他工具**
- lite-object-pool：零依赖对象池，减少 GC 压力
- bresenham-lighting-engine：基于 Bresenham 算法的 CPU 2D 光照引擎

**Vue 生态**
- TresJS：Vue 声明式 Three.js
- Mana Potion：支持 Vue
- particle-wave-sphere：WebGL 粒子波浪球体动画库，支持 Vue 2/3

**React 生态**
- React Three Fiber：React 声明式 Three.js
- Mana Potion：支持 React
- Deck.gl：与 React 深度集成
- particle-wave-sphere：支持 React