/* ============================================
   启知 · 科普游戏 - 主应用逻辑
   整合：背景切换 + 吉祥物 + 任务验证系统
   ============================================ */

// ========== 状态管理 ==========
const State = {
    audience: 'general', // general / elderly / youth / middle
    currentTask: null,
    currentEggTask: null,
    completedToday: [],
    lastActiveDate: null,
    user: {
        name: '启知用户',
        level: 1,
        title: '科普新手',
        totalExpEarned: 0,
        availableExp: 0,
        streakDays: 0,
        completedCount: 0,
        verifiedCount: 0,
        welfareRedeemed: []
    },
    stats: {
        totalOpens: 0,
        totalRefresh: 0,
        totalCompletions: 0,
        totalSkips: 0,
        verificationMethods: { self: 0, quiz: 0, timed: 0 }
    },
    lastTaskId: null,
    history: [],
    isFestival: false,
    scene: 'default' // default / reward / festival
};

const $ = id => document.getElementById(id);

// ========== 初始化 ==========
window.addEventListener('DOMContentLoaded', () => {
    loadState();
    if (typeof ErrorReview !== 'undefined') ErrorReview.init();
    if (typeof PuzzleEngine !== 'undefined') PuzzleEngine.init();
    if (typeof ShareEngine !== 'undefined') ShareEngine.init();
    if (typeof RankEngine !== 'undefined') RankEngine.init();
    initUI();
    initEventListeners();
    setupAgeDetection();
    autoRefreshTask();
    applyTheme();
    animateMascotEntry();
});

// ========== 本地存储 ==========
function saveState() {
    localStorage.setItem('qizhi_state', JSON.stringify({
        user: State.user,
        stats: State.stats,
        completedToday: State.completedToday,
        lastTaskId: State.lastTaskId,
        history: State.history.slice(-50),
        audience: State.audience
    }));
}

function loadState() {
    try {
        const saved = localStorage.getItem('qizhi_state');
        if (saved) {
            const data = JSON.parse(saved);
            if (data.user) Object.assign(State.user, data.user);
            if (data.stats) Object.assign(State.stats, data.stats);
            if (data.completedToday) State.completedToday = data.completedToday;
            if (data.lastTaskId) State.lastTaskId = data.lastTaskId;
            if (data.history) State.history = data.history;
            if (data.audience) State.audience = data.audience;
        }
    } catch(e) { console.warn('读取本地数据失败，使用默认值'); }

    updateStreak();
}

function updateStreak() {
    const today = new Date().toDateString();
    if (State.lastActiveDate === today) return;

    const yesterday = new Date(Date.now() - 86400000).toDateString();
    if (State.lastActiveDate === yesterday) {
        State.user.streakDays = (State.user.streakDays || 0) + 1;
    } else {
        State.user.streakDays = 1;
    }
    State.lastActiveDate = today;
}

// ========== 年龄段检测与自动匹配 ==========
function setupAgeDetection() {
    // 手动切换入口供用户选择年龄段
    const audienceTabs = document.querySelectorAll('.aud-tab');
    audienceTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const audience = tab.dataset.audience;
            if (State.audience === audience) return;

            audienceTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            State.audience = audience;
            saveState();

            autoRefreshTask();
            applyTheme();
            showToast(`已切换至「${getAudienceName(audience)}」模式`);
        });
    });

    // 初次加载时设置当前标签
    const activeTab = document.querySelector(`.aud-tab[data-audience="${State.audience}"]`);
    if (activeTab) {
        audienceTabs.forEach(t => t.classList.remove('active'));
        activeTab.classList.add('active');
    }
}

function getAudienceName(audience) {
    const names = { general: '通用模式', elderly: '老年模式', youth: '青少年模式', middle: '中青年模式' };
    return names[audience] || '通用模式';
}

// ========== 主题与背景应用 ==========
function applyTheme() {
    const bg = getBackgroundForAudience(State.audience, State.scene);
    const mascotColor = getMascotColorForAudience(State.audience);

    // 设置背景
    const bgLayer = $('bgLayer');
    bgLayer.style.cssText = bg.css;
    bgLayer.innerHTML = bg.svg;
    bgLayer.setAttribute('data-bg', Object.keys(BG_CONFIG).find(k => BG_CONFIG[k] === bg));

    // 更新吉祥物
    const mascotWrap = $('mascotWrap');
    mascotWrap.innerHTML = getMascotImgHTML(mascotColor, 64);

    // 更新主题类
    const root = document.documentElement;
    root.classList.remove('theme-elderly', 'theme-youth', 'theme-middle');
    root.classList.add(`theme-${State.audience}`);

    // 老年模式特殊优化
    if (State.audience === 'elderly') {
        document.body.classList.add('elderly-mode');
    } else {
        document.body.classList.remove('elderly-mode');
    }

    // 背景切换动画
    bgLayer.classList.add('bg-transition');
    setTimeout(() => bgLayer.classList.remove('bg-transition'), 500);
}

// ========== 任务获取 ==========
function getTaskPool() {
    const db = TASK_DATABASE[State.audience] || TASK_DATABASE.general;
    const pool = [];

    // 权重分配：轻松60% / 普通30% / 进阶10%
    const weights = [
        { type: 'easy', weight: 60 },
        { type: 'normal', weight: 30 },
        { type: 'advanced', weight: 10 }
    ];

    weights.forEach(({ type, weight }) => {
        const tasks = db[type];
        if (!tasks || tasks.length === 0) return;
        const count = Math.ceil((weight / 100) * 10);
        for (let i = 0; i < count; i++) {
            pool.push({ task: tasks[Math.floor(Math.random() * tasks.length)], weight });
        }
    });

    return pool;
}

function pickTask() {
    const pool = getTaskPool();
    if (pool.length === 0) return null;

    // 避免重复
    let pick;
    let retries = 0;
    const maxRetries = 3;
    do {
        pick = pool[Math.floor(Math.random() * pool.length)].task;
        retries++;
    } while (pick.id === State.lastTaskId && retries < maxRetries);
    State.lastTaskId = pick.id;

    // 记录统计
    State.stats.totalRefresh++;
    return pick;
}

function pickEggTask() {
    // 每日彩蛋：按日期索引轮换
    const todayIdx = new Date().getDate() % EGG_TASKS.length;
    return EGG_TASKS[todayIdx];
}

function autoRefreshTask() {
    const task = pickTask();
    State.currentTask = task;
    renderTask(task);
    renderEggTask(pickEggTask());
    saveState();
}

// ========== 任务渲染 ==========
function renderTask(task) {
    if (!task) return;

    const card = $('cardMain');
    card.classList.add('card-exit');

    setTimeout(() => {
        card.classList.remove('card-exit');
        card.classList.add('card-enter');

        card.innerHTML = `
            <div class="task-top">
                <span class="task-icon">${task.icon}</span>
                <span class="task-level ${task.tag === '轻松' ? 'level-easy' : task.tag === '普通' ? 'level-normal' : 'level-advanced'}">
                    ${task.tag}级
                </span>
            </div>
            <h2 class="task-title">${task.title}</h2>
            <p class="task-desc">${task.desc}</p>
            <div class="task-meta">
                <span class="meta-item">⏱️ ${task.duration}</span>
                <span class="meta-item">📝 ${getVerifyLabel(task.verifyType)}</span>
            </div>

            <div class="verify-area" id="verifyArea"></div>

            ${task.source ? `
                <div class="mission-source">
                    <span class="source-label">📎 科普溯源：</span>
                    <a class="source-link" href="${task.sourceUrl}" target="_blank" rel="noopener">${task.source}</a>
                </div>
            ` : ''}

            <div class="card-actions">
                <button class="btn btn-skip" id="btnSkip">
                    <span>换一个</span>
                    <small>无惩罚，自由刷</small>
                </button>
                <button class="btn btn-complete" id="btnComplete" disabled>
                    <span>打卡完成 +1 经验</span>
                    <small>需先通过验证</small>
                </button>
            </div>
        `;

        // 初始化验证系统
        VerificationEngine.render(task, $('verifyArea'), {
            onVerified: () => {
                const btn = $('btnComplete');
                btn.disabled = false;
                btn.querySelector('small').textContent = '验证已通过 ✓';
                btn.querySelector('span').textContent = '确认打卡 +1 经验';
                btn.classList.add('verified');
                State.stats.verificationMethods[VERIFY_TYPES[task.verifyType] || 'self']++;
            }
        });

        $('btnSkip').addEventListener('click', () => {
            State.stats.totalSkips++;
            autoRefreshTask();
            showToast('已为你换一道新任务 🔄');
        });

        $('btnComplete').addEventListener('click', () => handleComplete(task));

        setTimeout(() => card.classList.remove('card-enter'), 400);
    }, 300);
}

function getVerifyLabel(type) {
    const labels = {
        confirm: '自确认 · 点击完成',
        quiz: '知识小测验 · 答题验证',
        timed: '精读挑战 · 计时阅读'
    };
    return labels[type] || type;
}

function renderEggTask(task) {
    if (!task) return;
    const egg = $('eggCard');
    egg.innerHTML = `
        <div class="egg-icon">${task.icon}</div>
        <div class="egg-content">
            <div class="egg-tag">🌟 今日彩蛋</div>
            <div class="egg-title">${task.title}</div>
            <div class="egg-desc">${task.desc}</div>
        </div>
        <button class="egg-check" id="eggCheck">打卡</button>
    `;
    $('eggCheck').addEventListener('click', () => {
        egg.classList.add('done');
        showToast('彩蛋完成 +1 ⭐');
        handleComplete(task, true);
    });
}

// ========== 完成处理 ==========
function handleComplete(task, isEgg = false) {
    if (!isEgg) {
        const btn = $('btnComplete');
        if (btn.disabled) return;
    }

    const exp = isEgg ? 2 : 1;
    State.user.totalExpEarned += exp;
    State.user.availableExp += exp;
    State.user.completedCount++;
    State.stats.totalCompletions++;
    State.completedToday.push(task.id);
    State.history.unshift({
        id: task.id,
        title: task.title,
        completedAt: Date.now(),
        isEgg
    });

    // 等级更新
    updateLevel();
    saveState();

    // 成功动画
    showSuccessFeedback(task, isEgg);

    // 知识碎片奖励（每次完成任务有概率获得碎片）
    if (typeof PuzzleEngine !== 'undefined' && Math.random() > 0.3) {
        const fragment = PuzzleEngine.api.rewardFragment();
        if (fragment) {
            setTimeout(() => {
                showToast(`🧩 获得知识碎片：${fragment.name}`);
            }, 1600);
        }
    }

    // 2秒后自动刷新下一任务
    setTimeout(() => {
        autoRefreshTask();
    }, 2000);
}

function updateLevel() {
    const exp = State.user.totalExpEarned;
    let levelInfo = LEVEL_EXP_TABLE[0];
    for (let i = LEVEL_EXP_TABLE.length - 1; i >= 0; i--) {
        if (exp >= LEVEL_EXP_TABLE[i].exp) {
            levelInfo = LEVEL_EXP_TABLE[i];
            break;
        }
    }

    if (levelInfo.level !== State.user.level) {
        State.user.level = levelInfo.level;
        State.user.title = levelInfo.title;
        showToast(`🎉 恭喜升级！Lv.${levelInfo.level} ${levelInfo.title}`);
    }
}

// ========== 反馈动画 ==========
function showSuccessFeedback(task, isEgg = false) {
    const encouragement = ENCOURAGEMENT_MSGS[Math.floor(Math.random() * ENCOURAGEMENT_MSGS.length)];

    // 卡片完成动画
    const card = $('cardMain');
    card.classList.add('card-complete');

    // 浮动反馈
    const feedback = $('feedbackLayer');
    feedback.innerHTML = `
        <div class="feedback-pop ${isEgg ? 'egg' : ''}">
            <div class="feedback-exp">+1 ${isEgg ? '⭐' : '✨'}</div>
            <div class="feedback-title">${task.icon} 打卡成功！</div>
            <div class="feedback-msg">${encouragement}</div>
            <div class="feedback-level">Lv.${State.user.level} ${State.user.title}</div>
        </div>
    `;
    feedback.classList.add('show');

    // 触发吉祥物庆祝动画
    const mascot = $('mascotWrap');
    mascot.classList.add('mascot-celebrate');

    setTimeout(() => {
        feedback.classList.remove('show');
        mascot.classList.remove('mascot-celebrate');
    }, 2000);

    updateStatsDisplay();
}

function showToast(msg) {
    const toast = $('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function animateMascotEntry() {
    const mascot = $('mascotWrap');
    mascot.style.opacity = '0';
    mascot.style.transform = 'scale(0.5) translateY(20px)';
    setTimeout(() => {
        mascot.style.transition = 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)';
        mascot.style.opacity = '1';
        mascot.style.transform = 'scale(1) translateY(0)';
    }, 100);
}

// ========== UI 初始化 ==========
function initUI() {
    updateStatsDisplay();
    initPersonalCenter();
}

function updateStatsDisplay() {
    const userLevel = $('userLevel');
    if (userLevel) userLevel.textContent = `Lv.${State.user.level}`;
    const userExp = $('userExp');
    if (userExp) userExp.textContent = `${State.user.availableExp} 经验`;
    const streak = $('streakDays');
    if (streak) streak.textContent = State.user.streakDays || 1;
    const streak2 = $('streakDays2');
    if (streak2) streak2.textContent = State.user.streakDays || 1;
    const completed = $('completedCount');
    if (completed) completed.textContent = State.user.completedCount;

    // 进度条（首页可能不存在，做防御）
    const nextLevel = LEVEL_EXP_TABLE[State.user.level] || LEVEL_EXP_TABLE[LEVEL_EXP_TABLE.length - 1];
    const curLevelExp = LEVEL_EXP_TABLE[State.user.level - 1] ? LEVEL_EXP_TABLE[State.user.level - 1].exp : 0;
    const progress = nextLevel.exp > curLevelExp
        ? Math.min(100, ((State.user.totalExpEarned - curLevelExp) / (nextLevel.exp - curLevelExp)) * 100)
        : 100;
    const expBar = $('expBar');
    if (expBar) expBar.style.width = progress + '%';
    const expProgress = $('expProgress');
    if (expProgress) expProgress.textContent = `${State.user.totalExpEarned} / ${nextLevel.exp} EXP`;
}

function initPersonalCenter() {
    // 用户卡片
    const pLevel = $('profileLevel');
    if (pLevel) pLevel.textContent = `Lv.${State.user.level} ${State.user.title}`;

    const pExp = $('profileUserExp');
    if (pExp) pExp.textContent = State.user.availableExp;

    // 进度条
    const nextLevel = LEVEL_EXP_TABLE[State.user.level] || LEVEL_EXP_TABLE[LEVEL_EXP_TABLE.length - 1];
    const curLevelExp = LEVEL_EXP_TABLE[State.user.level - 1] ? LEVEL_EXP_TABLE[State.user.level - 1].exp : 0;
    const progress = nextLevel.exp > curLevelExp
        ? Math.min(100, ((State.user.totalExpEarned - curLevelExp) / (nextLevel.exp - curLevelExp)) * 100)
        : 100;
    const pBar = $('profileExpBar');
    if (pBar) pBar.style.width = progress + '%';
    const pProgress = $('profileExpProgress');
    if (pProgress) pProgress.textContent = `${State.user.totalExpEarned} / ${nextLevel.exp} EXP`;

    // 福利兑换
    const welfareList = $('profileWelfareList');
    if (welfareList) {
        welfareList.innerHTML = WELFARE_LIST.map(w => `
            <div class="welfare-item">
                <div class="welfare-icon">${w.icon}</div>
                <div class="welfare-info">
                    <div class="welfare-name">${w.name}</div>
                    <div class="welfare-cost">${w.cost} 经验</div>
                </div>
                <button class="welfare-btn" data-cost="${w.cost}" ${State.user.availableExp < w.cost ? 'disabled' : ''}>
                    兑换
                </button>
            </div>
        `).join('');

        welfareList.querySelectorAll('.welfare-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cost = parseInt(btn.dataset.cost);
                if (State.user.availableExp < cost) {
                    showToast('经验不足，继续打卡积累吧！');
                    return;
                }
                State.user.availableExp -= cost;
                saveState();
                updateStatsDisplay();
                initPersonalCenter();
                showToast('🎉 兑换成功！福利将发放至您的社区账户');
            });
        });
    }

    // 历史记录
    const historyList = $('profileHistoryList');
    if (historyList) {
        if (State.history.length === 0) {
            historyList.innerHTML = '<div class="empty-hint">暂无完成记录，快去打卡吧！</div>';
        } else {
            historyList.innerHTML = State.history.slice(0, 20).map(h => `
                <div class="history-item ${h.isEgg ? 'egg' : ''}">
                    <span class="h-title">${h.isEgg ? '🌟' : '✅'} ${h.title}</span>
                    <span class="h-time">${formatTime(h.completedAt)}</span>
                </div>
            `).join('');
        }
    }

    // 统计数据
    const sOpens = $('profileStatOpens');
    if (sOpens) sOpens.textContent = State.stats.totalOpens;
    const sRefresh = $('profileStatRefresh');
    if (sRefresh) sRefresh.textContent = State.stats.totalRefresh;
    const sComplete = $('profileStatComplete');
    if (sComplete) sComplete.textContent = State.stats.totalCompletions;
    const sSkip = $('profileStatSkip');
    if (sSkip) sSkip.textContent = State.stats.totalSkips;

    // 错题复盘
    if (typeof ErrorRenderer !== 'undefined') {
        ErrorRenderer.render();
    }
}

function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diff = Math.floor((now - d) / 60000);
    if (diff < 1) return '刚刚';
    if (diff < 60) return `${diff} 分钟前`;
    if (diff < 1440) return `${Math.floor(diff / 60)} 小时前`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ========== 事件监听 ==========
function initEventListeners() {
    // 底部导航
    document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.bottom-nav .nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const page = item.dataset.page;
            switchPage(page);
        });
    });

    // 顶部个人中心按钮 → 跳转 profile 页
    $('btnProfile').addEventListener('click', () => {
        document.querySelectorAll('.bottom-nav .nav-item').forEach(i => i.classList.remove('active'));
        document.querySelector('.bottom-nav .nav-item[data-page="profile"]').classList.add('active');
        switchPage('profile');
    });

    // 反馈层点击关闭
    $('feedbackLayer').addEventListener('click', (e) => {
        if (e.target.id === 'feedbackLayer') {
            e.target.classList.remove('show');
        }
    });

    // 拼图弹窗点击遮罩关闭
    const puzzleOverlay = $('puzzleOverlay');
    if (puzzleOverlay) {
        puzzleOverlay.addEventListener('click', (e) => {
            if (e.target.id === 'puzzleOverlay' && typeof PuzzleEngine !== 'undefined') {
                PuzzleEngine.closePopup();
            }
        });
    }

    // 统计
    State.stats.totalOpens++;
    saveState();
}

function switchPage(page) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(p => p.classList.remove('active'));
    const target = document.querySelector(`[data-page="${page}"]`);
    if (target) target.classList.add('active');

    // 切换到 profile 页时渲染内容
    if (page === 'profile') {
        initPersonalCenter();
    }

    // 切换到 discover 页时渲染拼图和分享广场
    if (page === 'discover') {
        if (typeof PuzzleEngine !== 'undefined') PuzzleEngine.render();
        if (typeof ShareEngine !== 'undefined') ShareEngine.render();
    }

    // 切换到 rank 页时渲染排行榜
    if (page === 'rank' && typeof RankEngine !== 'undefined') {
        RankEngine.render();
    }
}
