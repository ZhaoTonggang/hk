"use strict";
/* UNITY */
const lt = document.getElementById("loading-text"),
	cv = document.getElementById("unity-canvas"),
	pb = document.getElementById('progress-bar'),
	pf = document.getElementById("progress-fill"),
	loader = document.getElementById("loader"),
	svb = document.getElementById('savebtn'),
	setStatus = (text) => {
		if (!text) return;
		const match = text.match(/(.+)\((\d+\.?\d*)\/(\d+)\)/),
			match1 = text.match(/(\d+(\.\d+)?)%/),
			upStat = (a, b, c, d) => { // 公共函数
				lt.textContent = a;
				pf.value = b;
				pf.max = c;
				pf.hidden = false;
				pb.hidden = false;
				pf.style.width = d + '%';
			};
		if (match) {
			const formatBytes = (bytes) => { // 辅助函数：格式化字节数（KB/MB）
				if (bytes === 0) return '0 KB';
				const k = 1024;
				// 先将字节转换为 KB
				const kb = bytes / k;
				// 限制单位范围：仅 KB 和 MB
				if (kb < k) {
					// 小于 1024 KB，显示 KB
					return kb.toFixed(2) + ' KB';
				} else {
					// 大于等于 1024 KB，显示 MB
					return (kb / k).toFixed(2) + ' MB';
				}
			}
			const [current, total] = match.slice(2, 4).map(Number);
			const percent = total > 0 ? (current / total * 100).toFixed(2) : 0.00;
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
	odb = (n) => {
		return new Promise((ok, bd) => {
			const r = indexedDB.open(n);
			r.onsuccess = () => ok(r.result);
			r.onerror = () => bd(r.error);
		});
	},
	ga = (d, s) => {
		return new Promise((ok, bd) => {
			const t = d.transaction([s], 'readonly'),
				st = t.objectStore(s),
				r = st.getAll();
			r.onsuccess = () => ok(r.result);
			r.onerror = () => bd(r.error);
		});
	};
svb.onclick = async () => {
	try {
		const dbs = await indexedDB.databases();
		let sv = {},
			fd = false;
		for (const inf of dbs) {
			const db = await odb(inf.name);
			for (const st of db.objectStoreNames) {
				try {
					const dt = await ga(db, st);
					if (dt && dt.length > 0) {
						const fx = dt.map(it => {
							if (it.contents && it.contents instanceof Uint8Array) {
								return {
									...it,
									contents: Array.from(it.contents)
								};
							}
							return it;
						});
						sv[`${inf.name}/${st}`] = fx;
						fd = true;
					}
				} catch (e) {}
			}
			db.close();
		}
		if (!fd) {
			alert('No save found');
			return;
		}
		const js = JSON.stringify(sv),
			bl = new Blob([js], {
				type: 'application/octet-stream'
			}),
			u = URL.createObjectURL(bl),
			a = document.createElement('a');
		a.href = u;
		a.download = 'hk_save.dat';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(u);
	} catch (e) {
		alert('Download failed: ' + e.message);
	}
};
document.getElementById('btn-confirm').onclick = (e) => {
	e.currentTarget.style.display = 'none';
	loader.style.display = 'flex';
	// 开启全屏
	if (!document.fullscreenElement) document.documentElement.requestFullscreen();
	// 封装错误处理函数
	const handleError = (err) => {
			console.error('❌ ' + err);
			setStatus(`错误: ${err}`);
		},
		// 封装Worker终止逻辑
		terminateWorker = () => {
			if (worker) {
				worker.terminate();
				console.log('✅ worker 关闭成功')
			}
		},
		worker = new Worker('./script/worker.js');
	// 监听Worker消息
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
						productVersion: "1.0"
					}, (progress) => {
						progress = `${(progress * 100).toFixed(2)}%`;
						setStatus(`${progress} - 数据载入中...`);
					}).then(() => {
						loader.style.display = "none";
						// svb.style.display = 'block';
					}).catch(alert);
				};
				document.body.appendChild(sc);
				break;
		}
	}
	// 监听Worker错误
	worker.onerror = (err) => {
		handleError(`Worker错误: ${err.message} (行${err.lineno})`);
		terminateWorker();
	}
	// 监听Worker消息错误
	worker.onmessageerror = (err) => {
		handleError(`Worker消息错误: ${err.message}`);
		terminateWorker();
	}
	// 页面关闭时终止worker
	window.addEventListener("beforeunload", (event) => {
		event.preventDefault();
		terminateWorker();
	});
}