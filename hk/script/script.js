"use strict";
/* UNITY */
let toastTimer, slotInfoCache = {},
	confirmResolver = null,
	copySrc = 1;
const lt = document.getElementById("loading-text"),
	cv = document.getElementById("unity-canvas"),
	pb = document.getElementById('progress-bar'),
	pf = document.getElementById("progress-fill"),
	loader = document.getElementById("loader"),
	svb = document.getElementById('savemgr'),
	saveModal = document.getElementById('save-modal'),
	slotRows = Array.from(document.querySelectorAll('.slot-row')),
	toastEl = document.getElementById('save-toast'),
	confirmModal = document.getElementById('confirm-modal'),
	confirmTitle = document.getElementById('confirm-title'),
	confirmText = document.getElementById('confirm-text'),
	confirmOkBtn = document.getElementById('confirm-ok'),
	copyModal = document.getElementById('copy-modal'),
	copyText = document.getElementById('copy-text'),
	copyTargetBtns = Array.from(document.querySelectorAll('.copy-tgt')),
	// 虚拟按键常量
	canvasEl = document.getElementById('unity-canvas'),
	joyBase = document.getElementById('tc-joystick'),
	joyStick = document.getElementById('tc-stick'),
	pressed = new Set(),
	// 虚拟按键映射表
	KEYS = {
		up: {
			key: 'ArrowUp',
			code: 'ArrowUp',
			keyCode: 38
		},
		down: {
			key: 'ArrowDown',
			code: 'ArrowDown',
			keyCode: 40
		},
		left: {
			key: 'ArrowLeft',
			code: 'ArrowLeft',
			keyCode: 37
		},
		right: {
			key: 'ArrowRight',
			code: 'ArrowRight',
			keyCode: 39
		},
		jump: {
			key: 'z',
			code: 'KeyZ',
			keyCode: 90
		}, // 跳跃 Z
		attack: {
			key: 'x',
			code: 'KeyX',
			keyCode: 88
		}, // 攻击 X
		dash: {
			key: 'c',
			code: 'KeyC',
			keyCode: 67
		}, // 冲刺 C
		focus: {
			key: 'a',
			code: 'KeyA',
			keyCode: 65
		}, // 聚集/施法 A
		map: {
			key: 'Tab',
			code: 'Tab',
			keyCode: 9
		}, // 快速地图 Tab
		superdash: {
			key: 's',
			code: 'KeyS',
			keyCode: 83
		}, // 超级冲刺 S
		dreamnail: {
			key: 'd',
			code: 'KeyD',
			keyCode: 68
		}, // 梦之钉 D
		quickcast: {
			key: 'f',
			code: 'KeyF',
			keyCode: 70
		}, // 快速施法 F
		inventory: {
			key: 'i',
			code: 'KeyI',
			keyCode: 73
		} // 物品栏 I
	},
	// 更新加载状态文本与进度条
	setStatus = (text) => {
		if (!text) return;
		const match = text.match(/(.+)\((\d+\.?\d*)\/(\d+)\)/),
			match1 = text.match(/(\d+(\.\d+)?)%/),
			upStat = (a, b, c, d) => {
				lt.textContent = a;
				pf.value = b;
				pf.max = c;
				pf.hidden = false;
				pb.hidden = false;
				pf.style.width = d + '%';
			},
			formatBytes = (bytes) => {
				if (bytes === 0) return '0 KB';
				const k = 1024,
					kb = bytes / k;
				return kb < k ? kb.toFixed(2) + ' KB' : (kb / k).toFixed(2) + ' MB';
			};
		if (match) {
			const [current, total] = match.slice(2, 4).map(Number),
				percent = total > 0 ? (current / total * 100).toFixed(2) : 0.00;
			upStat(match[1] + `(${formatBytes(current)}/${formatBytes(total)}) ${percent}%`, current, total, percent);
		} else if (match1) {
			const current = Number(match1[1]);
			upStat(text, current, 100, current > 0 ? current : 0);
		} else {
			lt.textContent = text;
			pf.hidden = true;
			pb.hidden = true;
		}
	},
	// IndexedDB 工具合集：打开库 / 确保库与仓库存在 / 获取全部键值 / 批量写入
	idb = {
		// 打开已有数据库（只读，不修改结构）
		open: (n) => {
			return new Promise((ok, bd) => {
				const r = indexedDB.open(n);
				r.onsuccess = () => ok(r.result);
				r.onerror = () => bd(r.error);
			});
		},
		// 确保数据库+对象仓库存在，不存在则自动创建（导入用）
		ensureDB: (dbName, storeName) => {
			return new Promise((ok, bd) => {
				const req = indexedDB.open(dbName);
				req.onupgradeneeded = () => {
					const db = req.result;
					if (!db.objectStoreNames.contains(storeName)) {
						const store = db.createObjectStore(storeName);
						store.createIndex('timestamp', 'timestamp', {
							unique: false
						});
					}
				};
				req.onsuccess = () => {
					const db = req.result;
					if (!db.objectStoreNames.contains(storeName)) {
						const version = db.version + 1;
						db.close();
						const upgradeReq = indexedDB.open(dbName, version);
						upgradeReq.onupgradeneeded = () => {
							const db = upgradeReq.result;
							const store = db.createObjectStore(storeName);
							store.createIndex('timestamp', 'timestamp', {
								unique: false
							});
						};
						upgradeReq.onsuccess = () => ok(upgradeReq.result);
						upgradeReq.onerror = () => bd(upgradeReq.error);
					} else {
						ok(db);
					}
				};
				req.onerror = () => bd(req.error);
			});
		},
		// 获取所有键值对（保留完整主键，兼容外部主键模式）
		getAllKV: (d, s) => {
			return new Promise((ok, bd) => {
				const t = d.transaction([s], 'readonly');
				const st = t.objectStore(s);
				const keysReq = st.getAllKeys();
				const valsReq = st.getAll();
				let keys, vals;
				let finished = 0;
				const checkDone = () => {
					if (++finished === 2) {
						ok(keys.map((key, idx) => ({
							key,
							value: vals[idx]
						})));
					}
				};
				keysReq.onsuccess = () => {
					keys = keysReq.result;
					checkDone();
				};
				keysReq.onerror = () => bd(keysReq.error);
				valsReq.onsuccess = () => {
					vals = valsReq.result;
					checkDone();
				};
				valsReq.onerror = () => bd(valsReq.error);
			});
		},
		// 批量写入（显式传入主键，适配 out-of-line keys）
		putAll: (d, s, data) => {
			return new Promise((ok, bd) => {
				const t = d.transaction([s], 'readwrite');
				const st = t.objectStore(s);
				data.forEach(item => st.put(item.value, item.key));
				t.oncomplete = () => ok();
				t.onerror = () => bd(t.error);
				t.onabort = () => bd(t.error);
			});
		}
	},
	// 标准MD5算法实现（与Unity计算结果完全对齐）
	md5 = (string) => {
		const rotateLeft = (value, shift) => {
				return (value << shift) | (value >>> (32 - shift));
			},
			addUnsigned = (x, y) => {
				const result = (x & 0x7FFFFFFF) + (y & 0x7FFFFFFF);
				if (x & 0x80000000) {
					return y & 0x80000000 ?
						(result ^ 0x80000000 ^ 0x80000000) >>> 0 :
						(result ^ 0x80000000) >>> 0;
				} else {
					return y & 0x80000000 ?
						(result ^ 0x80000000) >>> 0 :
						result >>> 0;
				}
			},
			F = (x, y, z) => (x & y) | ((~x) & z),
			G = (x, y, z) => (x & z) | (y & (~z)),
			H = (x, y, z) => x ^ y ^ z,
			I = (x, y, z) => y ^ (x | (~z)),
			FF = (a, b, c, d, x, s, ac) => {
				a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac));
				return addUnsigned(rotateLeft(a, s), b);
			},
			GG = (a, b, c, d, x, s, ac) => {
				a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac));
				return addUnsigned(rotateLeft(a, s), b);
			},
			HH = (a, b, c, d, x, s, ac) => {
				a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac));
				return addUnsigned(rotateLeft(a, s), b);
			},
			II = (a, b, c, d, x, s, ac) => {
				a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac));
				return addUnsigned(rotateLeft(a, s), b);
			},
			convertToWordArray = (str) => {
				const wordCount = (((str.length + 8) - ((str.length + 8) % 64)) / 64 + 1) * 16,
					wordArray = new Array(wordCount).fill(0);
				let bytePos = 0,
					byteCount = 0;
				while (byteCount < str.length) {
					const pos = (byteCount - (byteCount % 4)) / 4;
					bytePos = (byteCount % 4) * 8;
					wordArray[pos] |= str.charCodeAt(byteCount) << bytePos;
					byteCount++;
				}
				const pos = (byteCount - (byteCount % 4)) / 4;
				bytePos = (byteCount % 4) * 8;
				wordArray[pos] |= 0x80 << bytePos;
				wordArray[wordCount - 2] = str.length << 3;
				wordArray[wordCount - 1] = str.length >>> 29;
				return wordArray;
			},
			wordToHex = (value) => {
				let hex = '';
				for (let i = 0; i <= 3; i++) {
					const byte = (value >>> (i * 8)) & 255;
					hex += ('0' + byte.toString(16)).slice(-2);
				}
				return hex;
			},
			x = convertToWordArray(string),
			S11 = 7,
			S12 = 12,
			S13 = 17,
			S14 = 22,
			S21 = 5,
			S22 = 9,
			S23 = 14,
			S24 = 20,
			S31 = 4,
			S32 = 11,
			S33 = 16,
			S34 = 23,
			S41 = 6,
			S42 = 10,
			S43 = 15,
			S44 = 21,
			xlen = x.length;
		let a = 0x67452301,
			b = 0xEFCDAB89,
			c = 0x98BADCFE,
			d = 0x10325476;
		for (let k = 0; k < xlen; k += 16) {
			const AA = a,
				BB = b,
				CC = c,
				DD = d;
			a = FF(a, b, c, d, x[k + 0], S11, 0xD76AA478);
			d = FF(d, a, b, c, x[k + 1], S12, 0xE8C7B756);
			c = FF(c, d, a, b, x[k + 2], S13, 0x242070DB);
			b = FF(b, c, d, a, x[k + 3], S14, 0xC1BDCEEE);
			a = FF(a, b, c, d, x[k + 4], S11, 0xF57C0FAF);
			d = FF(d, a, b, c, x[k + 5], S12, 0x4787C62A);
			c = FF(c, d, a, b, x[k + 6], S13, 0xA8304613);
			b = FF(b, c, d, a, x[k + 7], S14, 0xFD469501);
			a = FF(a, b, c, d, x[k + 8], S11, 0x698098D8);
			d = FF(d, a, b, c, x[k + 9], S12, 0x8B44F7AF);
			c = FF(c, d, a, b, x[k + 10], S13, 0xFFFF5BB1);
			b = FF(b, c, d, a, x[k + 11], S14, 0x895CD7BE);
			a = FF(a, b, c, d, x[k + 12], S11, 0x6B901122);
			d = FF(d, a, b, c, x[k + 13], S12, 0xFD987193);
			c = FF(c, d, a, b, x[k + 14], S13, 0xA679438E);
			b = FF(b, c, d, a, x[k + 15], S14, 0x49B40821);
			a = GG(a, b, c, d, x[k + 1], S21, 0xF61E2562);
			d = GG(d, a, b, c, x[k + 6], S22, 0xC040B340);
			c = GG(c, d, a, b, x[k + 11], S23, 0x265E5A51);
			b = GG(b, c, d, a, x[k + 0], S24, 0xE9B6C7AA);
			a = GG(a, b, c, d, x[k + 5], S21, 0xD62F105D);
			d = GG(d, a, b, c, x[k + 10], S22, 0x02441453);
			c = GG(c, d, a, b, x[k + 15], S23, 0xD8A1E681);
			b = GG(b, c, d, a, x[k + 4], S24, 0xE7D3FBC8);
			a = GG(a, b, c, d, x[k + 9], S21, 0x21E1CDE6);
			d = GG(d, a, b, c, x[k + 14], S22, 0xC33707D6);
			c = GG(c, d, a, b, x[k + 3], S23, 0xF4D50D87);
			b = GG(b, c, d, a, x[k + 8], S24, 0x455A14ED);
			a = GG(a, b, c, d, x[k + 13], S21, 0xA9E3E905);
			d = GG(d, a, b, c, x[k + 2], S22, 0xFCEFA3F8);
			c = GG(c, d, a, b, x[k + 7], S23, 0x676F02D9);
			b = GG(b, c, d, a, x[k + 12], S24, 0x8D2A4C8A);
			a = HH(a, b, c, d, x[k + 5], S31, 0xFFFA3942);
			d = HH(d, a, b, c, x[k + 8], S32, 0x8771F681);
			c = HH(c, d, a, b, x[k + 11], S33, 0x6D9D6122);
			b = HH(b, c, d, a, x[k + 14], S34, 0xFDE5380C);
			a = HH(a, b, c, d, x[k + 1], S31, 0xA4BEEA44);
			d = HH(d, a, b, c, x[k + 4], S32, 0x4BDECFA9);
			c = HH(c, d, a, b, x[k + 7], S33, 0xF6BB4B60);
			b = HH(b, c, d, a, x[k + 10], S34, 0xBEBFBC70);
			a = HH(a, b, c, d, x[k + 13], S31, 0x289B7EC6);
			d = HH(d, a, b, c, x[k + 0], S32, 0xEAA127FA);
			c = HH(c, d, a, b, x[k + 3], S33, 0xD4EF3085);
			b = HH(b, c, d, a, x[k + 6], S34, 0x04881D05);
			a = HH(a, b, c, d, x[k + 9], S31, 0xD9D4D039);
			d = HH(d, a, b, c, x[k + 12], S32, 0xE6DB99E5);
			c = HH(c, d, a, b, x[k + 15], S33, 0x1FA27CF8);
			b = HH(b, c, d, a, x[k + 2], S34, 0xC4AC5665);
			a = II(a, b, c, d, x[k + 0], S41, 0xF4292244);
			d = II(d, a, b, c, x[k + 7], S42, 0x432AFF97);
			c = II(c, d, a, b, x[k + 14], S43, 0xAB9423A7);
			b = II(b, c, d, a, x[k + 5], S44, 0xFC93A039);
			a = II(a, b, c, d, x[k + 12], S41, 0x655B59C3);
			d = II(d, a, b, c, x[k + 3], S42, 0x8F0CCC92);
			c = II(c, d, a, b, x[k + 10], S43, 0xFFEFF47D);
			b = II(b, c, d, a, x[k + 1], S44, 0x85845DD1);
			a = II(a, b, c, d, x[k + 8], S41, 0x6FA87E4F);
			d = II(d, a, b, c, x[k + 15], S42, 0xFE2CE6E0);
			c = II(c, d, a, b, x[k + 6], S43, 0xA3014314);
			b = II(b, c, d, a, x[k + 13], S44, 0x4E0811A1);
			a = II(a, b, c, d, x[k + 4], S41, 0xF7537E82);
			d = II(d, a, b, c, x[k + 11], S42, 0xBD3AF235);
			c = II(c, d, a, b, x[k + 2], S43, 0x2AD7D2BB);
			b = II(b, c, d, a, x[k + 9], S44, 0xEB86D391);
			a = addUnsigned(a, AA);
			b = addUnsigned(b, BB);
			c = addUnsigned(c, CC);
			d = addUnsigned(d, DD);
		}
		return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase();
	},
	// ========== 存档工具合集 ==========
	saveUtil = {
		// 槽位编号 → IDBFS 文件名
		//   1~4 = user1~4.dat（游戏实际读取）
		//   5   = user.dat      （备用槽 A，游戏不读取）
		//   6   = user0.dat     （备用槽 B，游戏不读取）
		slotKey: (hash, slot) => {
			const SLOT_FILES = {
				1: 'user1.dat',
				2: 'user2.dat',
				3: 'user3.dat',
				4: 'user4.dat',
				5: 'user.dat',
				6: 'user0.dat'
			};
			return '/idbfs/' + hash + '/' + SLOT_FILES[slot];
		},
		// 槽位显示名：1~4=存档1~4，5=备用1(user.dat)，6=备用2(user0.dat)
		slotLabel: (s) => s >= 5 ? '备用 ' + (s - 4) : '存档 ' + s,
		// 精确匹配 user.dat / user0~4.dat（排除 .bak 备份、userN_版本号.dat 等），返回槽位编号
		getSlot: (path) => {
			const m = String(path).match(/\/user(?:(\d+))?\.dat$/i);
			if (!m) return null;
			if (m[1] === undefined) return 5; // user.dat → 备用槽 A
			const n = +m[1];
			return n === 0 ? 6 : n; // user0.dat → 备用槽 B
		},
		// 遍历所有库/store，定位主键中含当前 URL hash 的 userN.dat 所在位置（只读主键）
		locateSave: async () => {
			// 严格对齐 Unity WebGL 的 IDBFS MD5 计算逻辑
			let url = window.location.href;
			const qIdx = url.indexOf('?');
			if (qIdx !== -1) url = url.substring(0, qIdx);
			const lastSlash = url.lastIndexOf('/');
			const hash = md5(url.substring(0, lastSlash));
			const marker = '/idbfs/' + hash + '/';
			for (const info of await indexedDB.databases()) {
				if (!info.name) continue;
				let db;
				try {
					db = await idb.open(info.name);
				} catch (e) {
					continue;
				}
				try {
					for (const sn of Array.from(db.objectStoreNames)) {
						let keys;
						try {
							keys = await new Promise((ok, bd) => {
								const r = db.transaction(sn, 'readonly').objectStore(sn).getAllKeys();
								r.onsuccess = () => ok(r.result);
								r.onerror = () => bd(r.error);
							});
						} catch (e) {
							continue;
						}
						if (keys.some(k => String(k).includes(marker) && saveUtil.getSlot(k) !== null)) {
							return {
								hash,
								target: {
									dbName: info.name,
									storeName: sn
								}
							};
						}
					}
				} finally {
					db.close();
				}
			}
			return {
				hash,
				target: null
			};
		}
	},
	// ========== UI 弹窗与提示工具 ==========
	ui = {
		toast: (msg, isError = false) => {
			toastEl.textContent = msg;
			toastEl.classList.toggle('error', isError);
			toastEl.classList.add('show');
			clearTimeout(toastTimer);
			toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
		},
		closeConfirm: (val) => {
			confirmModal.classList.remove('show');
			if (confirmResolver) {
				confirmResolver(val);
				confirmResolver = null;
			}
		},
		closeCopy: () => copyModal.classList.remove('show'),
		// 删除/覆盖确认弹窗（Promise 风格，可自定义标题与按钮文字）
		askConfirm: (text, opt = {}) => {
			confirmTitle.textContent = opt.title || '删除存档';
			confirmOkBtn.textContent = opt.okText || '确认删除';
			confirmText.textContent = text;
			confirmModal.classList.add('show');
			return new Promise(res => {
				confirmResolver = res;
			});
		}
	},
	// 打开管理面板：扫描各槽位存档状态并更新按钮
	openManager = async () => {
			// 存档实际字节数（即游戏读取的文件大小；Int8Array 的 byteLength == length）
			const byteSize = (v) => {
					const c = v && v.contents;
					if (!c) return 0;
					if (ArrayBuffer.isView(c)) return c.byteLength;
					if (c instanceof ArrayBuffer) return c.byteLength;
					return c.length || 0;
				},
				// 存档时间格式化为 YYYY-MM-DD HH:mm（本地时间）
				fmtDate = (t) => {
					const d = t instanceof Date ? t : new Date(t);
					if (isNaN(d.getTime())) return '';
					const p = n => String(n).padStart(2, '0');
					return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
						' ' + p(d.getHours()) + ':' + p(d.getMinutes());
				};
			saveModal.classList.add('show');
			slotRows.forEach(row => {
				row.querySelector('.slot-status').textContent = '读取中…';
				row.querySelector('.slot-status').classList.remove('has');
				row.querySelector('.act-export').disabled = true;
				row.querySelector('.act-copy').disabled = true;
				row.querySelector('.act-delete').disabled = true;
			});
			try {
				slotInfoCache = {};
				const {
					hash,
					target
				} = await saveUtil.locateSave();
				if (target) {
					const db = await idb.open(target.dbName);
					let rows = [];
					try {
						rows = await idb.getAllKV(db, target.storeName);
					} finally {
						db.close();
					}
					for (const r of rows) {
						if (!String(r.key).includes('/idbfs/' + hash + '/')) continue;
						const s = saveUtil.getSlot(r.key);
						if (s !== null) slotInfoCache[s] = {
							size: byteSize(r.value),
							time: r.value && r.value.timestamp
						};
					}
				}
				slotRows.forEach(row => {
					const slot = +row.dataset.slot,
						status = row.querySelector('.slot-status'),
						info = slotInfoCache[slot];
					if (info) {
						const kb = info.size >= 1024 ? (info.size / 1024).toFixed(1) + ' KB' : info.size + ' B',
							date = fmtDate(info.time);
						status.textContent = (date ? date + ' · ' : '') + kb;
						status.classList.add('has');
					} else {
						status.textContent = '空';
					}
					row.querySelector('.act-export').disabled = !info;
					row.querySelector('.act-copy').disabled = !info;
					row.querySelector('.act-delete').disabled = !info;
				});
			} catch (e) {
				slotRows.forEach(row => row.querySelector('.slot-status').textContent = '—');
				ui.toast('读取存档状态失败：' + e.message, true);
			}
		},
		// 虚拟按键相关
		sendKey = (type, def) => {
			const ev = new KeyboardEvent(type, {
				key: def.key,
				code: def.code,
				keyCode: def.keyCode,
				which: def.keyCode,
				bubbles: true,
				cancelable: true
			});
			(canvasEl || window).dispatchEvent(ev);
		},
		release = (btn) => {
			const def = KEYS[btn.dataset.k];
			if (!def || !pressed.has(btn)) return;
			pressed.delete(btn);
			btn.classList.remove('active');
			sendKey('keyup', def);
		},
		// 兜底：切后台/松手异常时释放所有仍按住的键，避免角色一直移动
		releaseAll = () => {
			pressed.forEach(b => release(b));
		};
svb.onclick = openManager;
// 隐藏的文件选择器（导入用）
const importInput = document.createElement('input');
importInput.type = 'file';
importInput.accept = '.hk.json.ztg';
let pendingSlot = 1;
// 事件委托：每个槽位的 导出 / 导入 / 拷贝 / 删除
document.getElementById('save-slots').addEventListener('click', async (e) => {
	const btn = e.target.closest('.act-btn');
	if (!btn || btn.disabled) return;
	const slot = +btn.closest('.slot-row').dataset.slot;
	if (btn.dataset.act === 'export') {
		try {
			const {
				hash,
				target
			} = await saveUtil.locateSave();
			if (!target) {
				ui.toast('未找到当前 URL 的存档', true);
				return;
			}
			const db = await idb.open(target.dbName);
			let rows;
			try {
				rows = await idb.getAllKV(db, target.storeName);
			} finally {
				db.close();
			}
			const row = rows.find(r => String(r.key).includes('/idbfs/' + hash + '/') && saveUtil.getSlot(r
				.key) === slot);
			if (!row) {
				ui.toast(saveUtil.slotLabel(slot) + '为空', true);
				return;
			}
			const url = URL.createObjectURL(new Blob([JSON.stringify(Array.from(new Uint8Array(row.value
				.contents.buffer, row.value.contents.byteOffset, row.value.contents
				.byteLength)))], {
				type: 'application/octet-stream'
			}));
			// 文件名：slot{槽位}_{存档日期}_{存档时间}.hk.json.ztg
			const stamp = (() => {
					const d = row.value && row.value.timestamp ? new Date(row.value.timestamp) :
						new Date();
					if (isNaN(d.getTime())) return '';
					const p = n => String(n).padStart(2, '0');
					return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
						'_' + p(d.getHours()) + '-' + p(d.getMinutes());
				})(),
				a = document.createElement('a');
			a.href = url;
			a.download = 'slot' + slot + '_' + stamp + '.hk.json.ztg';
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
			ui.toast(saveUtil.slotLabel(slot) + '已导出');
		} catch (e) {
			ui.toast('导出失败：' + e.message, true);
		}
	} else if (btn.dataset.act === 'import') {
		pendingSlot = slot;
		importInput.value = '';
		importInput.click();
	} else if (btn.dataset.act === 'copy') {
		// 拷贝目标选择弹窗
		copySrc = slot;
		copyText.textContent = '将「' + saveUtil.slotLabel(slot) + '」拷贝到目标存档：';
		copyTargetBtns.forEach(b => b.disabled = (+b.dataset.dst === slot));
		copyModal.classList.add('show');
	} else if (btn.dataset.act === 'delete') {
		const ok = await ui.askConfirm('确定删除' + saveUtil.slotLabel(slot) + '吗？\n此操作不可恢复。');
		if (!ok) return;
		try {
			// ========== 删除存档 ==========
			const {
				hash,
				target
			} = await saveUtil.locateSave();
			if (!target) throw new Error('未找到当前 URL 的存档');
			const key = saveUtil.slotKey(hash, slot),
				db = await idb.open(target.dbName);
			try {
				await new Promise((ok, bd) => {
					const t = db.transaction(target.storeName, 'readwrite');
					t.objectStore(target.storeName).delete(key);
					t.oncomplete = () => ok();
					t.onerror = () => bd(t.error);
					t.onabort = () => bd(t.error);
				});
			} finally {
				db.close();
			}
			await openManager();
			ui.toast(saveUtil.slotLabel(slot) + ' 删除成功');
		} catch (err) {
			ui.toast('删除失败：' + err.message, true);
		}
	}
});
// ========== 拷贝存档（源槽位 → 目标槽位，复制二进制内容） ==========
copyTargetBtns.forEach(btn => btn.addEventListener('click', async () => {
	if (btn.disabled) return;
	const dst = +btn.dataset.dst,
		src = copySrc;
	try {
		// 目标已有存档 → 二次确认覆盖
		if (slotInfoCache[dst]) {
			const ok = await ui.askConfirm(saveUtil.slotLabel(dst) + '已有存档，\n拷贝将覆盖它，确定继续吗？', {
				title: '覆盖存档',
				okText: '确认覆盖'
			});
			if (!ok) return;
		}
		// ========== 拷贝存档 ==========
		const {
			hash,
			target
		} = await saveUtil.locateSave();
		if (!target) throw new Error('未找到当前 URL 的存档');
		const db = await idb.open(target.dbName);
		try {
			const rows = await idb.getAllKV(db, target.storeName),
				srcRow = rows.find(r => String(r.key) === saveUtil.slotKey(hash, src));
			if (!srcRow || !srcRow.value) throw new Error('源存档不存在');
			await idb.putAll(db, target.storeName, [{
				key: saveUtil.slotKey(hash, dst),
				value: {
					timestamp: new Date(),
					mode: srcRow.value.mode || 33206,
					contents: new Int8Array(srcRow.value.contents) // 复制独立副本
				}
			}]);
		} finally {
			db.close();
		}
		ui.closeCopy();
		await openManager();
		ui.toast('已将' + saveUtil.slotLabel(src) + '拷贝到' + saveUtil.slotLabel(dst));
	} catch (err) {
		ui.closeCopy();
		ui.toast('拷贝失败：' + err.message, true);
	}
}));
// ========== 导入存档（键名/时间等元信息导入时生成） ==========
importInput.onchange = async (e) => {
	const file = e.target.files[0];
	if (!file) return;
	const slot = pendingSlot;
	try {
		// 只允许导入 .hk.json.ztg 文件（accept 之外再做一次硬性校验）
		if (!file.name.toLowerCase().endsWith('.hk.json.ztg')) throw new Error('仅支持导入 .hk.json.ztg 存档文件');
		const bytes = JSON.parse(await file.text());
		if (!Array.isArray(bytes)) throw new Error('存档文件格式不正确');
		const {
			hash,
			target
		} = await saveUtil.locateSave(),
			dest = target || {
				dbName: '/idbfs',
				storeName: 'FILE_DATA'
			},
			rows = [{
				key: saveUtil.slotKey(hash, slot),
				value: {
					timestamp: new Date(),
					mode: 33206,
					contents: new Int8Array(Uint8Array.from(bytes, b => b & 0xFF).buffer)
				}
			}],
			db = await idb.ensureDB(dest.dbName, dest.storeName);
		try {
			await idb.putAll(db, dest.storeName, rows);
		} finally {
			db.close();
		}
		await openManager();
		ui.toast(saveUtil.slotLabel(slot) + '导入成功');
	} catch (e) {
		ui.toast('导入失败：' + e.message, true);
	}
};
// 键盘ESC关闭弹窗（拷贝目标菜单只能通过其关闭按钮关闭，不响应 Esc）
document.addEventListener('keydown', (e) => {
	if (e.key !== 'Escape') return;
	if (confirmModal.classList.contains('show')) ui.closeConfirm(false);
});
document.getElementById('save-modal-cancel').onclick = () => saveModal.classList.remove('show');
document.getElementById('confirm-ok').onclick = () => ui.closeConfirm(true);
document.getElementById('confirm-cancel').onclick = () => ui.closeConfirm(false);
confirmModal.onclick = (e) => {
	if (e.target === confirmModal) ui.closeConfirm(false);
};
// 拷贝目标菜单：仅"关闭"按钮可关闭（不响应遮罩点击与 Esc）
document.getElementById('copy-cancel').onclick = () => ui.closeCopy();
// 开始游戏
document.getElementById('btn-confirm').onclick = (e) => {
	e.currentTarget.style.display = 'none';
	svb.style.display = 'none';
	loader.style.display = 'flex';
	if (!document.fullscreenElement) document.documentElement.requestFullscreen();
	const handleError = (err) => {
			console.error('❌ ' + err);
			setStatus(`错误: ${err}`);
		},
		terminateWorker = () => {
			if (worker) {
				worker.terminate();
				console.log('✅ worker 关闭成功');
			}
		},
		worker = new Worker('./script/worker.js');
	worker.onmessage = (msg) => {
		const {
			type,
			data,
			error
		} = msg.data;
		switch (type) {
			case 'status':
				setStatus(data);
				break;
			case 'error':
				handleError(`Worker返回错误: ${error}`);
				break;
			case 'complete':
				if (!data.dataBuffer || !data.codeBuffer || !data.frameworkBuffer || !data.jsBuffer)
					throw new Error('❌ 数据缺失！');
				const sc = document.createElement("script");
				sc.defer = true;
				sc.type = 'text/javascript';
				sc.src = URL.createObjectURL(new Blob([data.jsBuffer], {
					type: 'application/javascript; charset=utf-8'
				}));
				sc.onload = () => {
					createUnityInstance(cv, {
						dataUrl: URL.createObjectURL(new Blob([data.dataBuffer], {
							type: 'application/octet-stream'
						})),
						frameworkUrl: URL.createObjectURL(new Blob([data.frameworkBuffer], {
							type: 'application/javascript; charset=utf-8'
						})),
						codeUrl: URL.createObjectURL(new Blob([data.codeBuffer], {
							type: 'application/wasm'
						})),
						streamingAssetsUrl: "./StreamingAssets",
						companyName: "Team Cherry",
						productName: "Hollow Knight",
						productVersion: "1.0",
						// 为了更好的性能，优先使用 WebGL2
						useWebGL2: true,
						// WebGL 上下文属性：无抗锯齿，不保留绘图缓冲区
						webglContextAttributes: {
							antialias: false,
							alpha: false,
							depth: true,
							stencil: false,
							premultipliedAlpha: false,
							preserveDrawingBuffer: false,
							desynchronized: true
						}
					}, (progress) => {
						progress = `${(progress * 100).toFixed(2)}%`;
						setStatus(`${progress} - 数据载入中...`);
					}).then(() => {
						loader.style.display = "none";
						// 显示虚拟按键并配置虚拟按键
						document.body.classList.add('game-running');
						// 只在 canvas 上派发一次：事件冒泡会依次经过 canvas → document → window，Unity 无论把键盘监听挂在这三者中的哪一个都能恰好收到一次（避免重复 keydown）
						document.querySelectorAll('#touch-controls .tc-btn').forEach(btn => {
							btn.addEventListener('pointerdown', (e) => {
								e.preventDefault();
								try {
									btn.setPointerCapture(e.pointerId);
								} catch (_) {}
								const def = KEYS[btn.dataset.k];
								if (def && !pressed.has(btn)) {
									pressed.add(btn);
									btn.classList.add('active');
									sendKey('keydown', def);
								}
							});
							['pointerup', 'pointercancel', 'lostpointercapture'].forEach(
								ev =>
								btn.addEventListener(ev, () => {
									const def = KEYS[btn.dataset.k];
									if (def && pressed.has(btn)) {
										pressed.delete(btn);
										btn.classList.remove('active');
										sendKey('keyup', def);
									}
								})
							);
							// 阻止长按菜单、双击缩放等默认手势
							btn.addEventListener('contextmenu', e => e.preventDefault());
						});
						document.addEventListener('visibilitychange', () => {
							if (document.hidden) releaseAll();
						});
						window.addEventListener('pagehide', releaseAll);
						window.addEventListener('blur', releaseAll);
						// ========== 虚拟摇杆：8 向死区 → 方向键（支持斜向组合） ==========
						if (joyBase && joyStick) {
							// move/up/cancel 一律挂在 window 上并以 pointerId 匹配，不依赖 setPointerCapture
							let joyId = null,
								curDirs = [],
								originX = 0,
								originY = 0;
							const DEAD = 0.32,
								// 双轴独立死区：垂直/水平推动只触发单轴，斜向推动两轴都过死区即组合（8 向）
								updateDirs = (dx, dy) => {
									const next = [];
									if (Math.abs(dy) > DEAD) next.push(dy < 0 ? 'up' : 'down');
									if (Math.abs(dx) > DEAD) next.push(dx < 0 ? 'left' : 'right');
									// 差集更新：新进入方向发 keydown，离开方向发 keyup
									for (const d of next)
										if (!curDirs.includes(d)) sendKey('keydown', KEYS[d]);
									for (const d of curDirs)
										if (!next.includes(d)) sendKey('keyup', KEYS[d]);
									curDirs = next;
								},
								// 强制回中：释放全部方向键并复位视觉（结束触摸 / 新指针接管 / 切后台时复用）
								joyReset = () => {
									joyId = null;
									joyBase.classList.remove('active');
									joyStick.classList.remove('moving');
									joyStick.style.transform = 'translate(0,0)';
									updateDirs(0, 0);
								},
								move = (e) => {
									if (e.pointerId !== joyId) return;
									let dx = e.clientX - originX,
										dy = e.clientY - originY;
									const r = joyBase.getBoundingClientRect(),
										// flex 居中后，内摇杆可移动半径 = 外盘半径 − 内摇杆半径（均按含 border 的盒尺寸）
										max = (r.width - joyStick.getBoundingClientRect().width) /
										2,
										// 以【按下瞬间的触点】为零点，只看手指的相对移动量，避免拇指没按在绝对中心时摇杆瞬间偏移、误触发方向（“向上飘”）
										len = Math.hypot(dx, dy);
									if (len > max) {
										dx = dx / len * max;
										dy = dy / len * max;
									}
									// dx,dy 为相对按下点的像素偏移（已限制在半径内）
									joyStick.style.transform = 'translate(' + dx + 'px,' + dy +
										'px)';
									updateDirs(dx / max, dy / max);
								},
								endPointer = (e) => {
									if (e.pointerId !== joyId) return;
									joyReset();
								},
								releaseStuckControls = () => {
									joyReset();
									releaseAll();
								};
							joyBase.addEventListener('pointerdown', (e) => {
								e.preventDefault();
								// 已有活动指针（多指误触 / 上一轮结束事件丢失的残留状态）时，先释放旧方向再让新指针接管，绝不能静默忽略 —— 否则旧方向键永不释放、新输入也全部失效
								if (joyId !== null) joyReset();
								joyId = e.pointerId;
								originX = e.clientX; // 按下点即零点
								originY = e.clientY;
								try {
									joyBase.setPointerCapture(e.pointerId);
								} catch (_) {}
								joyBase.classList.add('active');
								joyStick.classList.add('moving'); // 拖动时关闭过渡，做到实时跟手
								// 按下瞬间不偏移、不出方向，等待手指实际移动
								joyStick.style.transform = 'translate(0,0)';
							});
							window.addEventListener('pointermove', move);
							window.addEventListener('pointerup', endPointer);
							window.addEventListener('pointercancel', endPointer);
							// lostpointercapture 不冒泡：系统强制释放指针捕获（输入模式切换、触摸流被掐断）,可能只来这一个事件而没有 pointercancel，捕获阶段监听兜底回中
							window.addEventListener('lostpointercapture', endPointer, true);
							// 输入环境切换兜底：外接鼠标/触摸板（或 scrcpy 等注入鼠标事件的工具）的瞬间，Android 全屏下会弹"如需显示光标…"系统提示，部分 ROM 会静默掐断当前触摸流，不派发任何结束事件导致方向键卡死。用不依赖触摸事件的独立信号强制复位：
							// ① 精细指针设备热插拔 → (any-pointer: fine) 媒体查询变化
							if (window.matchMedia) {
								const fineMq = window.matchMedia('(any-pointer: fine)');
								fineMq.addEventListener('change', () => {
									if (fineMq.matches) releaseStuckControls();
								});
							}
							// ② 光标实际出现（鼠标事件到来）：覆盖设备开机时已连接、媒体查询不发生变化的环境（如 scrcpy 注入），摇杆/按键处于按下态时强制释放。
							// 仅响应无按键悬停的光标：鼠标按住拖拽摇杆时浏览器会派发 buttons=1 的边界校正
							// pointerover，不能把正常鼠标操作误判为设备切换
							window.addEventListener('pointerover', (e) => {
								if (e.pointerType === 'mouse' && e.buttons === 0 && (
										joyId !==
										null || pressed.size > 0)) releaseStuckControls();
							});
							joyBase.addEventListener('contextmenu', e => e.preventDefault());
							// 切后台/失焦时摇杆回中
							document.addEventListener('visibilitychange', () => {
								if (document.hidden) joyReset();
							});
							window.addEventListener('pagehide', joyReset);
							window.addEventListener('blur', joyReset);
						}
					}).catch(alert);
				};
				document.body.appendChild(sc);
				break;
		}
	}
	worker.onerror = (err) => {
		handleError(`Worker错误: ${err.message} (行${err.lineno})`);
		terminateWorker();
	}
	worker.onmessageerror = (err) => {
		handleError(`Worker消息错误: ${err.message}`);
		terminateWorker();
	}
	window.addEventListener("beforeunload", (event) => {
		event.preventDefault();
		terminateWorker();
	});
}