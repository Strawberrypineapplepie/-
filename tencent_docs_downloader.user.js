// ==UserScript==
// @name         腾讯文档顺序自动单选下载（虚拟滚动全量+反爬虫）
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  自动拖动虚拟滚动条，逐屏加载并顺序下载全部文档，带反爬虫机制
// @match        https://docs.qq.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 配置项
    const MIN_DELAY = 1500; // 每次下载最小间隔(ms)
    const MAX_DELAY = 3000; // 每次下载最大间隔(ms)
    const BATCH_SIZE = 20;  // 每批下载数量
    const BATCH_PAUSE = 40000; // 每批下载后暂停(ms)
    const MAX_DOWNLOAD = 500; // 最大下载数量，防止被风控

    // 获取文档列表的滚动容器
    function getScrollContainer() {
        const li = document.querySelector('li.desktop-list-item');
        if (!li) return null;
        let parent = li.parentElement;
        while (parent && parent !== document.body) {
            if (parent.scrollHeight > parent.clientHeight + 20) return parent;
            parent = parent.parentElement;
        }
        return null;
    }

    // 获取所有可见文档的li
    function getVisibleListItems() {
        return Array.from(document.querySelectorAll('li.desktop-list-item'));
    }

    // 获取所有可见文档的checkbox外层div
    function getVisibleCheckboxDivs() {
        return Array.from(document.querySelectorAll('div.dui-checkbox.desktop-list-item-checkbox'));
    }

    // 主流程
    async function startAutoDownload() {
        const scrollContainer = getScrollContainer();
        if (!scrollContainer) {
            alert('未找到文档列表的滚动容器，请确认页面结构未变更！');
            return;
        }

        // 统计总文档数
        let allLi = [];
        let lastCount = 0, sameCountTimes = 0;
        // 先滚动到底部，收集所有li的id
        for (let i = 0; i < 1000; i++) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
            await sleep(600);
            const items = getVisibleListItems();
            allLi = allLi.concat(items.filter(li => li.id));
            allLi = Array.from(new Set(allLi.map(li => li.id))).map(id => document.getElementById(id));
            if (allLi.length === lastCount) {
                sameCountTimes++;
            } else {
                sameCountTimes = 0;
            }
            lastCount = allLi.length;
            if (sameCountTimes >= 3) break;
        }
        scrollContainer.scrollTop = 0;
        await sleep(500);

        // 记录已下载的文档id
        const downloadedSet = new Set();
        let downloadCount = 0;
        let batchCount = 0;

        alert(`共检测到${allLi.length}个文档，将自动顺序下载，期间请勿操作页面。`);

        while (downloadedSet.size < allLi.length && downloadCount < MAX_DOWNLOAD) {
            // 每次滚动一屏
            for (let pos = 0; pos < scrollContainer.scrollHeight; pos += scrollContainer.clientHeight) {
                scrollContainer.scrollTop = pos;
                await sleep(800);

                // 当前可见li
                const visibleLis = getVisibleListItems();
                for (let li of visibleLis) {
                    if (!li.id || downloadedSet.has(li.id)) continue;

                    // 找到该li下的checkbox外层div
                    const checkboxDiv = li.querySelector('div.dui-checkbox.desktop-list-item-checkbox');
                    if (!checkboxDiv) continue;

                    // 取消所有勾选
                    getVisibleCheckboxDivs().forEach(div => {
                        const input = div.querySelector('input[type="checkbox"]');
                        if (input && input.checked) div.click();
                    });
                    await sleep(200);

                    // 勾选当前
                    const input = checkboxDiv.querySelector('input[type="checkbox"]');
                    if (input && !input.checked) checkboxDiv.click();
                    await sleep(600);

                    // 找到下载按钮并点击
                    let downloadBtn = document.querySelector('button#DownloadMenuItem.desktop-tools-menu-item');
                    let tryCount = 0;
                    while ((!downloadBtn || downloadBtn.disabled) && tryCount < 10) {
                        await sleep(300);
                        downloadBtn = document.querySelector('button#DownloadMenuItem.desktop-tools-menu-item');
                        tryCount++;
                    }
                    if (!downloadBtn || downloadBtn.disabled) {
                        alert(`文档[${li.innerText.trim().slice(0,20)}]未能激活下载按钮，请手动检查！`);
                        return;
                    }
                    downloadBtn.click();

                    // 等待下载弹窗出现
                    await sleep(2000);

                    // 等待下载完成
                    await sleep(randInt(MIN_DELAY, MAX_DELAY));

                    downloadedSet.add(li.id);
                    downloadCount++;
                    batchCount++;

                    // 反爬虫：每下载一批暂停
                    if (batchCount >= BATCH_SIZE) {
                        batchCount = 0;
                        await sleep(BATCH_PAUSE + randInt(0, 10000));
                    }
                    if (downloadCount >= MAX_DOWNLOAD) break;
                }
                if (downloadCount >= MAX_DOWNLOAD) break;
            }
            // 再回到顶部，防止有遗漏
            scrollContainer.scrollTop = 0;
            await sleep(800);
        }

        // 取消所有勾选
        getVisibleCheckboxDivs().forEach(div => {
            const input = div.querySelector('input[type="checkbox"]');
            if (input && input.checked) div.click();
        });
        alert(`全部文档已顺序下载完毕！共下载：${downloadedSet.size} 个`);
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // 创建启动按钮
    function createBtn() {
        if (document.getElementById('tdd-auto-download-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'tdd-auto-download-btn';
        btn.textContent = '顺序自动下载全部文档';
        btn.style.position = 'fixed';
        btn.style.top = '80px';
        btn.style.right = '40px';
        btn.style.zIndex = 9999;
        btn.style.padding = '10px 18px';
        btn.style.background = '#3477f5';
        btn.style.color = '#fff';
        btn.style.border = 'none';
        btn.style.borderRadius = '6px';
        btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
        btn.style.fontSize = '16px';
        btn.style.cursor = 'pointer';
        btn.onmouseenter = () => btn.style.background = '#2456b3';
        btn.onmouseleave = () => btn.style.background = '#3477f5';
        btn.onclick = startAutoDownload;
        document.body.appendChild(btn);
    }

    // 定时检测页面并插入按钮
    setInterval(() => {
        if (document.querySelector('div.dui-checkbox.desktop-list-item-checkbox')) {
            createBtn();
        }
    }, 1500);

})();