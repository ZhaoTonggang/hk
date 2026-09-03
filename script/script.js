"use strict";
const SUPPORTED_LANGS = [
		'zh-CN', 'zh-TW', 'zh-HK',
		'en-US', 'ko-KR', 'ja-JP',
		'ru-RU', 'kk-KZ',
		'es-ES', 'fr-FR', 'de-DE', 'pt-BR', 'it-IT',
		'th-TH', 'vi-VN',
		'ar-SA', 'tr-TR', 'nl-NL'
	],
	STORAGE_KEY = 'hk-lang',
	LANG_META = {
		'zh-CN': {
			native: '简体中文'
		},
		'zh-TW': {
			native: '繁體中文'
		},
		'zh-HK': {
			native: '繁體香港'
		},
		'en-US': {
			native: 'English'
		},
		'ko-KR': {
			native: '한국어'
		},
		'ja-JP': {
			native: '日本語'
		},
		'ru-RU': {
			native: 'Русский'
		},
		'kk-KZ': {
			native: 'Қазақша'
		},
		'es-ES': {
			native: 'Español'
		},
		'fr-FR': {
			native: 'Français'
		},
		'de-DE': {
			native: 'Deutsch'
		},
		'pt-BR': {
			native: 'Português'
		},
		'it-IT': {
			native: 'Italiano'
		},
		'th-TH': {
			native: 'ไทย'
		},
		'vi-VN': {
			native: 'Tiếng Việt'
		},
		'ar-SA': {
			native: 'العربية',
			rtl: true
		},
		'tr-TR': {
			native: 'Türkçe'
		},
		'nl-NL': {
			native: 'Nederlands'
		}
	},
	// 浏览器语言前缀 → 支持语言码的映射
	LANG_PREFIX_MAP = {
		'zh': 'zh-CN',
		'en': 'en-US',
		'ko': 'ko-KR',
		'ja': 'ja-JP',
		'ru': 'ru-RU',
		'kk': 'kk-KZ',
		'es': 'es-ES',
		'fr': 'fr-FR',
		'de': 'de-DE',
		'pt': 'pt-BR',
		'it': 'it-IT',
		'th': 'th-TH',
		'vi': 'vi-VN',
		'ar': 'ar-SA',
		'tr': 'tr-TR',
		'nl': 'nl-NL'
	},
	translations = {
		'zh-CN': {
			title: '空洞骑士 · Hollow Knight',
			'title-en': '⌈空洞骑士⌋系列',
			'title-cn': '网 页 版',
			'card1-line': '空 洞 骑 士',
			'card2-line': '空洞骑士：丝之歌',
			hint: '请 选 择 你 的 游 戏'
		},
		'zh-TW': {
			title: '空洞騎士 · Hollow Knight',
			'title-en': '⌈空洞騎士⌋系列',
			'title-cn': '網 頁 版',
			'card1-line': '空 洞 騎 士',
			'card2-line': '空洞騎士：絲之歌',
			hint: '請 選 擇 你 的 遊 戲'
		},
		'zh-HK': {
			title: '空洞騎士 · Hollow Knight',
			'title-en': '⌈空洞騎士⌋系列',
			'title-cn': '網 頁 版',
			'card1-line': '空 洞 騎 士',
			'card2-line': '空洞騎士：絲之歌',
			hint: '請 選 擇 你 的 遊 戲'
		},
		'en-US': {
			title: 'Hollow Knight · 空洞骑士',
			'title-en': 'HOLLOW KNIGHT SERIES',
			'title-cn': 'WEB EDITION',
			'card1-line': 'HOLLOW KNIGHT',
			'card2-line': 'Silksong',
			hint: 'CHOOSE YOUR GAME'
		},
		'ko-KR': {
			title: 'Hollow Knight · 할로우 나이트',
			'title-en': '할로우 나이트 시리즈',
			'title-cn': '웹 에디션',
			'card1-line': '할로우 나이트',
			'card2-line': '실크송',
			hint: '게임을 선택하세요'
		},
		'ja-JP': {
			title: 'Hollow Knight · ホロウナイト',
			'title-en': 'ホロウナイト シリーズ',
			'title-cn': 'ウェブ版',
			'card1-line': 'ホロウナイト',
			'card2-line': 'シルクソング',
			hint: 'ゲームを選んでください'
		},
		'ru-RU': {
			title: 'Hollow Knight · Полый рыцарь',
			'title-en': 'СЕРИЯ HOLLOW KNIGHT',
			'title-cn': 'ВЕБ-ВЕРСИЯ',
			'card1-line': 'HOLLOW KNIGHT',
			'card2-line': 'Silksong',
			hint: 'Выберите игру'
		},
		'kk-KZ': {
			title: 'Hollow Knight · Қуыс рыцарь',
			'title-en': 'HOLLOW KNIGHT СЕРИЯСЫ',
			'title-cn': 'ВЕБ-нұсқа',
			'card1-line': 'HOLLOW KNIGHT',
			'card2-line': 'Silksong',
			hint: 'Ойынды таңдаңыз'
		},
		'es-ES': {
			title: 'Hollow Knight',
			'title-en': 'SAGA HOLLOW KNIGHT',
			'title-cn': 'EDICIÓN WEB',
			'card1-line': 'HOLLOW KNIGHT',
			'card2-line': 'Silksong',
			hint: 'ELIGE TU JUEGO'
		},
		'fr-FR': {
			title: 'Hollow Knight',
			'title-en': 'SÉRIE HOLLOW KNIGHT',
			'title-cn': 'ÉDITION WEB',
			'card1-line': 'HOLLOW KNIGHT',
			'card2-line': 'Silksong',
			hint: 'CHOISISSEZ VOTRE JEU'
		},
		'de-DE': {
			title: 'Hollow Knight',
			'title-en': 'HOLLOW KNIGHT REIHE',
			'title-cn': 'WEB-EDITION',
			'card1-line': 'HOLLOW KNIGHT',
			'card2-line': 'Silksong',
			hint: 'WÄHLE DEIN SPIEL'
		},
		'pt-BR': {
			title: 'Hollow Knight',
			'title-en': 'SÉRIE HOLLOW KNIGHT',
			'title-cn': 'EDIÇÃO WEB',
			'card1-line': 'HOLLOW KNIGHT',
			'card2-line': 'Silksong',
			hint: 'ESCOLHA SEU JOGO'
		},
		'it-IT': {
			title: 'Hollow Knight',
			'title-en': 'SERIE HOLLOW KNIGHT',
			'title-cn': 'EDIZIONE WEB',
			'card1-line': 'HOLLOW KNIGHT',
			'card2-line': 'Silksong',
			hint: 'SCEGLI IL TUO GIOCO'
		},
		'th-TH': {
			title: 'Hollow Knight · อัศวินโหด',
			'title-en': 'ซีรีส์ Hollow Knight',
			'title-cn': 'เวอร์ชันเว็บ',
			'card1-line': 'Hollow Knight',
			'card2-line': 'Silksong',
			hint: 'เลือกเกมของคุณ'
		},
		'vi-VN': {
			title: 'Hollow Knight',
			'title-en': 'LOẠT GAME HOLLOW KNIGHT',
			'title-cn': 'PHIÊN BẢN WEB',
			'card1-line': 'HOLLOW KNIGHT',
			'card2-line': 'Silksong',
			hint: 'CHỌN GAME CỦA BẠN'
		},
		'ar-SA': {
			title: 'Hollow Knight · فارس أجوف',
			'title-en': 'سلسلة HOLLOW KNIGHT',
			'title-cn': 'الإصدار الإلكتروني',
			'card1-line': 'HOLLOW KNIGHT',
			'card2-line': 'Silksong',
			hint: 'اختر لعبتك'
		},
		'tr-TR': {
			title: 'Hollow Knight',
			'title-en': 'HOLLOW KNIGHT SERİSİ',
			'title-cn': 'WEB SÜRÜMÜ',
			'card1-line': 'HOLLOW KNIGHT',
			'card2-line': 'Silksong',
			hint: 'OYUNUNU SEÇ'
		},
		'nl-NL': {
			title: 'Hollow Knight',
			'title-en': 'HOLLOW KNIGHT SERIE',
			'title-cn': 'WEBVERSIE',
			'card1-line': 'HOLLOW KNIGHT',
			'card2-line': 'Silksong',
			hint: 'KIES JE SPEL'
		}
	},
	detectInitialLang = () => {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
		const navList = (navigator.languages && navigator.languages.length) ?
			navigator.languages : [navigator.language || navigator.userLanguage || ''];
		for (const nav of navList) {
			const prefix = (nav || '').toLowerCase().split('-')[0];
			if (LANG_PREFIX_MAP[prefix]) return LANG_PREFIX_MAP[prefix];
		}
		return 'zh-CN';
	},
	applyLang = (lang) => {
		const dict = translations[lang];
		if (!dict) return;
		document.querySelectorAll('[data-i18n]').forEach(el => {
			const key = el.getAttribute('data-i18n');
			if (dict[key] !== undefined) el.textContent = dict[key];
		});
		if (dict.title) document.title = dict.title;
		document.documentElement.lang = lang;
		// RTL 方向支持
		document.documentElement.dir = (LANG_META[lang] && LANG_META[lang].rtl) ? 'rtl' : 'ltr';
		localStorage.setItem(STORAGE_KEY, lang);
		const select = document.getElementById('langSelect');
		if (select && select.value !== lang) select.value = lang;
	};
// ==================== 初始化 ====================
(() => {
	const S = 'hk-lang',
		P = {
			zh: 'zh-CN',
			'zh-tw': 'zh-TW',
			'zh-hk': 'zh-HK',
			en: 'en-US',
			ko: 'ko-KR',
			ja: 'ja-JP',
			ru: 'ru-RU',
			kk: 'kk-KZ',
			es: 'es-ES',
			fr: 'fr-FR',
			de: 'de-DE',
			pt: 'pt-BR',
			it: 'it-IT',
			th: 'th-TH',
			vi: 'vi-VN',
			ar: 'ar-SA',
			tr: 'tr-TR',
			nl: 'nl-NL'
		},
		T = {
			'zh-CN': '空洞骑士 · Hollow Knight',
			'zh-TW': '空洞騎士 · Hollow Knight',
			'zh-HK': '空洞騎士 · Hollow Knight',
			'en-US': 'Hollow Knight · 空洞骑士',
			'ko-KR': 'Hollow Knight · 할로우 나이트',
			'ja-JP': 'Hollow Knight · ホロウナイト',
			'ru-RU': 'Hollow Knight · Полый рыцарь',
			'kk-KZ': 'Hollow Knight · Қуыс рыцарь',
			'es-ES': 'Hollow Knight',
			'fr-FR': 'Hollow Knight',
			'de-DE': 'Hollow Knight',
			'pt-BR': 'Hollow Knight',
			'it-IT': 'Hollow Knight',
			'th-TH': 'Hollow Knight · อัศวินโหด',
			'vi-VN': 'Hollow Knight',
			'ar-SA': 'Hollow Knight · فارس أجوف',
			'tr-TR': 'Hollow Knight',
			'nl-NL': 'Hollow Knight'
		};
	let L = localStorage.getItem(S);
	if (!P[L] || (L = P[L]) === undefined) {
		const ns = navigator.languages || [navigator.language || 'zh-CN'],
			len = ns.length;
		L = 'zh-CN';
		for (let i = 0; i < len; i++) {
			const p = (ns[i] || '').toLowerCase().split('-')[0];
			if (P[p]) {
				L = P[p];
				break;
			}
		}
	}
	document.documentElement.lang = L;
	document.documentElement.dir = (LANG_META[L] && LANG_META[L].rtl) ? 'rtl' : 'ltr';
	if (T[L]) document.title = T[L];
	applyLang(detectInitialLang());
	document.getElementById('langSelect').addEventListener('change', (e) => {
		applyLang(e.target.value);
	});
	// 动态粒子
	const container = document.getElementById('fireflies');
	for (let i = 0; i < 30; i++) {
		const el = document.createElement('span');
		el.style.width = el.style.height = 1 + Math.random() * 5 + 'px';
		el.style.left = Math.random() * 100 + '%';
		el.style.bottom = (-20 + Math.random() * 20) + 'px';
		el.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
		el.style.animationDuration = (6 + Math.random() * 10) + 's';
		el.style.animationDelay = (Math.random() * 10) + 's';
		el.style.opacity = 0;
		container.appendChild(el);
	}
})();