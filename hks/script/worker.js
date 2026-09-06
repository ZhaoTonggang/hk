"use strict";
importScripts('./7z/js7z.js');
// 定义数据块大小
const chunkSize = 1024 * 1024, // 1MB/块
	sendStatus = (message) => { // 用于向主线程发送状态更新
		self.postMessage({
			type: 'status',
			data: message
		});
	},
	sendError = (error) => { // 用于向主线程发送错误
		self.postMessage({
			type: 'error',
			error: error.message || error
		});
	},
	formatBytes = (bytes) => { // 辅助函数：格式化字节数（KB/MB）
		if (bytes === 0) return '0 KB';
		const k = 1024,
			// 先将字节转换为 KB
			kb = bytes / k;
		// 限制单位范围：仅 KB 和 MB
		if (kb < k) {
			// 小于 1024 KB，显示 KB
			return kb.toFixed(2) + ' KB';
		} else {
			// 大于等于 1024 KB，显示 MB
			return (kb / k).toFixed(2) + ' MB';
		}
	},
	withRetry = async (fn) => { // 自动重试工具函数：最多重试 maxRetries 次，失败后等待 1000 再试
			const maxRetries = 5;
			let lastError;
			for (let attempt = 0; attempt <= maxRetries; attempt++) {
				try {
					return await fn(attempt);
				} catch (err) {
					lastError = err;
					if (attempt < maxRetries) {
						await new Promise(resolve => setTimeout(resolve, 1000));
					}
				}
			}
			throw lastError;
		},
		runInSlices = async (task) => { // 分段执行函数
				const taskIterator = task(),
					executeSlice = async () => {
						let startTime = performance.now(),
							result;
						do {
							result = taskIterator.next();
							if (result.done) break;
						} while (performance.now() - startTime < 50);
						if (!result.done) {
							await new Promise(resolve => setTimeout(resolve, 10));
							return executeSlice();
						}
						return result.value;
					}
				return executeSlice();
			},
			downloadWithSlices = async (path, title, progressCallback = null) => {
					return await withRetry(async (attempt) => {
						if (attempt > 0) {
							sendStatus(`${title} 第${attempt}次重试...`);
						}
						const response = await fetch(path);
						if (!response.ok) throw new Error(
							`下载失败：${response.status} ${response.statusText}`);
						const totalSize = Number(response.headers.get('Content-Length')) || 0,
							reader = response.body.getReader();
						let chunks = [],
							totalReceived = 0;
						while (true) {
							const {
								done,
								value
							} = await reader.read();
							if (done) break;
							chunks.push(value);
							totalReceived += value.length;
							if (progressCallback) {
								progressCallback(totalReceived, totalSize);
							} else {
								if (totalSize) {
									sendStatus(
										`${title}(${totalReceived}/${totalSize})`
									);
								} else {
									sendStatus(
										`${title}(${formatBytes(totalReceived)})`
									);
								}
							}
						}
						const buffer = new Uint8Array(totalReceived);
						let position = 0;
						for (const chunk of chunks) {
							buffer.set(chunk, position);
							position += chunk.length;
						}
						return {
							buffer,
							datalen: totalSize || totalReceived
						}
					});
				},
				// 递归遍历 js7z FS 目录，返回全部文件路径（跳过文件夹）
				walkJs7zFS = (dir, js7z) => {
					const results = [];
					let list;
					try {
						list = js7z.FS.readdir(dir);
					} catch (e) {
						console.warn('读取目录失败:', dir, e);
						return results;
					}
					for (const name of list) {
						if (name === '.' || name === '..') continue;
						const fullPath = dir + '/' + name;
						let stat;
						try {
							stat = js7z.FS.stat(fullPath);
						} catch (e) {
							continue;
						}
						if ((stat.mode & 16384) !== 0) {
							results.push(...walkJs7zFS(fullPath, js7z));
						} else {
							results.push(fullPath);
						}
					}
					return results;
				},
				// 将 js7z.FS 内的单个文件分段读取并写入 CacheStorage
				writeFileToCache = async (cache, fsPath, cacheKey, js7z) => {
						const stream = js7z.FS.open(fsPath, 'r'),
							size = js7z.FS.stat(fsPath).size,
							chunks = [];
						let offset = 0;
						try {
							while (offset < size) {
								const readLen = Math.min(chunkSize, size - offset),
									buf = new Uint8Array(readLen);
								js7z.FS.read(stream, buf, 0, readLen, offset);
								chunks.push(buf);
								offset += readLen;
								if (offset % (chunkSize * 10) === 0) {
									await new Promise(r => setTimeout(r, 0));
								}
							}
						} finally {
							js7z.FS.close(stream);
						}
						await cache.put(cacheKey, new Response(new Blob(chunks)));
					},
					process7zVolumes = async (l, n, s, o, y) => {
						let js7z = null,
							cache = null;
						const url = y ? 'https://storage.heheda.top/hks/' : '../roms/',
							paths = Array.from({
								length: l
							}, (_, i) => url + n + '.7z.00' + String(i + 1)),
							zName = n,
							volumeNames = [],
							pathlen = paths.length;
						try {
							// 初始化JS7z实例（只初始化一次）
							sendStatus('正在初始化JS7z...');
							js7z = await new Promise((resolve, reject) => {
								JS7z({
									locateFile: () => './7z/js7z.wasm',
									print: (str) => str.trim() && (console.log(str), sendStatus(
										str)),
									printErr: (str) => str.trim() && (console.error(str),
										sendStatus(
											str)),
									noExitRuntime: true
								}).then(resolve).catch(reject);
							});
							if (!js7z) throw new Error('JS7z初始化失败！');
							cache = await caches.open('GameData');
							sendStatus(`准备处理 ${pathlen} 个分卷包`);
							// 检查缓存是否全部命中
							let allCached = true;
							for (let i = 0; i < pathlen; i++) {
								const volName = `${zName}.${String(i + 1).padStart(3, '0')}`,
									cachedResp = await cache.match(volName);
								if (!cachedResp) {
									allCached = false;
									break;
								}
							}
							if (allCached) {
								sendStatus(`从缓存加载 ${pathlen} 个分卷`);
								for (let i = 0; i < pathlen; i++) {
									const volName = `${zName}.${String(i + 1).padStart(3, '0')}`,
										cachedResp = await cache.match(volName),
										data = new Uint8Array(await cachedResp.arrayBuffer()),
										stream = js7z.FS.open(volName, 'w+');
									try {
										const blen = data.length;
										let pos = 0;
										while (pos < blen) {
											const end = Math.min(pos + chunkSize, blen);
											js7z.FS.write(stream, data.subarray(pos, end), 0, end - pos);
											pos = end;
										}
									} finally {
										js7z.FS.close(stream);
									}
									volumeNames.push(volName);
								}
							} else {
								// 并行下载分卷
								sendStatus(`并行下载 ${pathlen} 个数据包...`);
								let lastStatusTime = 0;
								const volProgress = new Array(pathlen).fill(0),
									volSizes = new Array(pathlen).fill(0),
									downloadTasks = paths.map((path, i) => {
										const volName = `${zName}.${String(i + 1).padStart(3, '0')}`,
											progressCallback = (received, size) => {
												volProgress[i] = received;
												volSizes[i] = size || 0;
												const now = performance.now();
												if (now - lastStatusTime < 200) return;
												lastStatusTime = now;
												const totalReceived = volProgress.reduce((a, b) => a + b, 0),
													totalSize = volSizes.reduce((a, b) => a + b, 0) || s;
												sendStatus(
													`数据包下载中... (${totalReceived}/${totalSize}) ${Math.floor((totalReceived / totalSize) * 100)}%`
												);
											};
										return downloadWithSlices(path, `数据包${i + 1}`, progressCallback)
											.then(result => ({
												volName,
												data: result.buffer,
												datalen: result.datalen,
												index: i,
												success: true
											}))
											.catch(err => ({
												volName,
												index: i,
												success: false,
												error: err
											}));
									});
								const results = await Promise.all(downloadTasks),
									failed = results.filter(r => !r.success);
								if (failed.length > 0) throw new Error(
									`数据包下载失败: ${failed.map(f => f.volName).join(', ')}`);
								const sortedResults = results.filter(r => r.success).sort((a, b) => a.index - b
									.index);
								sendStatus(`下载完成，写入虚拟文件系统...`);
								const totalWriteBytes = sortedResults.reduce((sum, r) => sum + r.data.length, 0),
									sortedRlen = sortedResults.length;
								let writtenBytes = 0;
								for (let i = 0; i < sortedRlen; i++) {
									const result = sortedResults[i],
										{
											volName,
											datalen
										} = result;
									let data = result.data;
									await runInSlices(function*() {
										let stream = null;
										try {
											stream = js7z.FS.open(volName, 'w+');
											const blen = data.length;
											let pos = 0;
											while (pos < blen) {
												const end = Math.min(pos + chunkSize, blen);
												js7z.FS.write(stream, data.subarray(pos, end), 0, end -
													pos);
												pos = end;
												sendStatus(
													`正在写入数据... [当前:${volName} | 第:${i + 1}个 / 共:${sortedRlen}个] (${writtenBytes + pos}/${totalWriteBytes})`
												);
												yield;
											}
										} finally {
											if (stream) js7z.FS.close(stream);
										}
									});
									writtenBytes += data.length;
									// 存入缓存
									await cache.put(volName, new Response(data, {
										headers: {
											'Content-Type': 'application/x-7z-compressed',
											'Content-Length': datalen
										}
									})).catch(err => console.error(`缓存数据包 ${volName} 失败：`, err));
									data = null;
									result.data = null;
									volumeNames.push(volName);
								}
							}
							// 调用7z解压（同步阻塞）
							const extractTarget = volumeNames[0];
							sendStatus(`开始解压: ${extractTarget}`);
							js7z.callMain(['x', extractTarget, '-p2585649532', '-aoa', '-y']);
							// 执行业务回调，两套逻辑差异全部放到回调里
							await o(js7z, volumeNames, cache);
						} catch (err) {
							sendError(err);
							throw err;
						} finally {
							// 清理VFS中分卷文件
							if (js7z && js7z.FS) {
								try {
									for (const v of volumeNames) {
										if (js7z.FS.analyzePath(v).exists) js7z.FS.unlink(v);
									}
								} catch (e) {
									console.error('清理7z分卷文件失败：', e);
								}
							}
						}
					};
// ========== 业务入口：分别定义两套任务回调 ==========
self.onmessage = async (ev) => {
	const {
		cmd,
		skipTask1
	} = ev.data;
	if (cmd !== "start") return;
	try {
		// 分支逻辑
		if (!skipTask1) {
			// 无缓存：执行任务1
			await process7zVolumes(4, 'roms', 1956898227, async (js7z, volumeNames, cache) => {
				sendStatus("解压完成，遍历全部文件写入缓存...");
				const allExtractedFiles = walkJs7zFS('/', js7z);
				sendStatus(`共发现文件：${allExtractedFiles.length} 个`);
				let processedCount = 0;
				const totalCount = allExtractedFiles.length;
				for (const fsFilePath of allExtractedFiles) {
					const cacheKey = fsFilePath.split('/').pop();
					const volCheck = fsFilePath.replace(/^\//, '');
					if (volumeNames.includes(volCheck)) {
						processedCount++;
						continue;
					}
					try {
						await writeFileToCache(cache, fsFilePath, cacheKey, js7z);
						processedCount++;
						if (processedCount % 20 === 0 || processedCount === totalCount) {
							sendStatus(`写入缓存 ${processedCount}/${totalCount} : ${cacheKey}`);
						}
					} catch (e) {
						sendStatus(`[警告]写入缓存失败 ${fsFilePath} : ${e.message}`);
						console.error("写入缓存异常", fsFilePath, e);
					}
					if (processedCount % 20 === 0) {
						await new Promise(r => setTimeout(r, 0));
					}
				}
				// 删除缓存里原始7z分卷压缩包
				sendStatus("开始清理缓存资源");
				for (const volName of volumeNames) {
					try {
						await cache.delete(volName);
					} catch (err) {
						console.warn(`删除缓存分卷 ${volName} 失败`, err);
					}
				}
				await cache.put("CACHE_COMPLETE", new Response("ok"));
				sendStatus("全部完成，准备进行下一步");
			}, 1);
		} else {
			// 有缓存：跳过任务1
			sendStatus("检测到roms缓存已存在，跳过");
		}
		// 任务2永远执行
		await process7zVolumes(2, 'data', 34722545, async (js7z) => {
			sendStatus("data分卷解压完成，读取UnityWeb资源...");
			const dataBuffer = js7z.FS.readFile('w-pt.data.unityweb').buffer,
				codeBuffer = js7z.FS.readFile('w-pt.wasm.unityweb').buffer,
				frameworkBuffer = js7z.FS.readFile('w-pt.framework.js.unityweb').buffer,
				jsBuffer = js7z.FS.readFile('w-pt.loader.js').buffer;
			self.postMessage({
				type: 'complete',
				data: {
					dataBuffer,
					codeBuffer,
					frameworkBuffer,
					jsBuffer
				}
			}, [dataBuffer, codeBuffer, frameworkBuffer, jsBuffer]);
		});
	} catch (err) {
		sendError(err);
	}
};