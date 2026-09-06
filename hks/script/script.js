"use strict";
const loadingText = document.querySelector("#loading-text"),
	loadingBar = document.querySelector("#unity-loading-bar"),
	progressBarFull = document.querySelector("#unity-progress-bar-full"),
	pb = document.getElementById('unity-progress-bar-empty'),
	CACHE_NAME = "GameData", // bump version if needed
	originalFetch = window.fetch,
	setStatus = (text) => {
		if (!text) return;
		const match = text.match(/(.+)\((\d+\.?\d*)\/(\d+)\)/),
			match1 = text.match(/(\d+(\.\d+)?)%/),
			upStat = (a, b, c, d) => { // 公共函数
				loadingText.textContent = a;
				progressBarFull.value = b;
				progressBarFull.max = c;
				progressBarFull.hidden = false;
				pb.hidden = false;
				progressBarFull.style.width = d + '%';
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
			loadingText.textContent = text;
			progressBarFull.hidden = true;
			pb.hidden = true;
		}
	};
/* ================= FETCH OVERRIDE ================= */
window.fetch = async function(resource, options) {
	const cache = await caches.open(CACHE_NAME),
		cachedResponse = await cache.match(new Request(
			`script/${new URL(typeof resource === "string" ? resource : resource.url, location.origin).pathname.split("/").pop()}`
		), {
			ignoreSearch: true,
			ignoreVary: true
		});
	if (cachedResponse) return cachedResponse;
	return originalFetch(resource, options);
};
/* ================= MAIN ================= */
document.getElementById('stbtn').onclick = async (e) => {
	e.currentTarget.style.display = 'none';
	loadingBar.style.display = 'block';
	// 开启全屏
	if (!document.fullscreenElement) document.documentElement.requestFullscreen();
	try {
		let datas = null;
		// 是否存在缓存
		const hasFullCache = await (await caches.open(CACHE_NAME)).match(new Request("script/CACHE_COMPLETE"));
		setStatus('准备中...');
		// 启动7z Worker，等待资源解压缓存完成
		await new Promise((resolve, reject) => {
			const worker = new Worker("./script/worker.js");
			// 向Worker下发执行指令：存在缓存则skipTask1=true
			worker.postMessage({
				cmd: "start",
				skipTask1: !!hasFullCache
			});
			worker.onmessage = (ev) => {
				const {
					type,
					data,
					error
				} = ev.data;
				switch (type) {
					case "status":
						setStatus(data);
						break;
					case "error":
						worker.terminate();
						const err = typeof error === "string" ? error : JSON.stringify(error);
						setStatus(`错误：${err}`);
						reject(new Error(err));
						break;
					case "complete":
						if (!data.dataBuffer || !data.codeBuffer || !data.frameworkBuffer || !
							data.jsBuffer) reject(new Error('❌ 数据缺失！'));
						datas = data;
						worker.terminate();
						resolve(true);
						break;
				}
			};
			worker.onerror = (err) => {
				worker.terminate();
				reject(new Error(`Worker异常:${err.message}`));
			};
		});
		setStatus('资源缓存完成');
		/* ================= UNITY 初始化 ================= */
		const warningBanner = document.querySelector("#unity-warning"),
			unityShowBanner = (msg, type) => {
				const update = () => {
					warningBanner.style.display = warningBanner.children.length ? 'block' : 'none';
				}
				let div = document.createElement('div');
				div.innerHTML = msg;
				warningBanner.appendChild(div);
				if (type == 'error') {
					div.style = 'background:red;padding:10px;';
				} else {
					if (type == 'warning') div.style = 'background:yellow;padding:10px;';
					setTimeout(() => {
						warningBanner.removeChild(div);
						update();
					}, 5000);
				}
				update();
			}
		const script = document.createElement("script");
		script.src = URL.createObjectURL(new Blob([datas.jsBuffer], {
			type: 'application/javascript; charset=utf-8'
		}));
		script.onload = () => {
			createUnityInstance(document.querySelector("#unity-canvas"), {
					dataUrl: URL.createObjectURL(new Blob([datas.dataBuffer], {
						type: 'application/octet-stream'
					})),
					frameworkUrl: URL.createObjectURL(new Blob([datas.frameworkBuffer], {
						type: 'application/octet-stream'
					})),
					codeUrl: URL.createObjectURL(new Blob([datas.codeBuffer], {
						type: 'application/octet-stream'
					})),
					streamingAssetsUrl: "./StreamingAssets",
					companyName: "EDUrocks Group, Truffled, GN-Math",
					productName: "Hollow Knight SilkSong",
					productVersion: "1.0",
					showBanner: unityShowBanner,
				}, (progress) => {
					progress = `${(progress * 100).toFixed(2)}%`;
					setStatus(`${progress} - 数据载入中...`);
				})
				.then(() => {
					loadingBar.remove();
				})
				.catch(err => {
					setStatus(`Unity启动失败：${err.message}`);
				})
		};
		document.body.appendChild(script);
	} catch (err) {
		console.error(err);
		setStatus(`捕获错误：${err.message}`);
	}
};