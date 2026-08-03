let currentData = null;
let currentTf = "1D";
let chartInstance = null;
let selectedTicker = null;

// アプリ起動時の初期化
document.addEventListener("DOMContentLoaded", () => {
    initChart();
    loadData();
    setupEventListeners();
});

// EChartsインスタンスの初期化
function initChart() {
    const chartDom = document.getElementById("sankeyChart");
    chartInstance = echarts.init(chartDom, "dark", { backgroundColor: "transparent" });
    
    window.addEventListener("resize", () => {
        chartInstance.resize();
    });
}

// JSONデータの読み込み (キャッシュバスティング対応)
async function loadData() {
    try {
        const response = await fetch("data.json?t=" + Date.now(), { cache: "no-store" });
        currentData = await response.json();
        renderDashboard(currentTf);
    } catch (error) {
        console.error("Failed to load flow data:", error);
    }
}

// イベントリスナーの設定
function setupEventListeners() {
    // 1. ダッシュボード vs マニュアル ビュー切替
    const viewBtns = document.querySelectorAll("#viewTabs .nav-btn");
    const dashboardView = document.getElementById("dashboardView");
    const manualView = document.getElementById("manualView");
    const timeframeTabs = document.getElementById("timeframeTabs");

    viewBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            viewBtns.forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");

            const view = e.target.getAttribute("data-view");
            if (view === "manual") {
                dashboardView.classList.add("hidden");
                manualView.classList.remove("hidden");
                timeframeTabs.style.opacity = "0.3";
                timeframeTabs.style.pointerEvents = "none";
            } else {
                manualView.classList.add("hidden");
                dashboardView.classList.remove("hidden");
                timeframeTabs.style.opacity = "1";
                timeframeTabs.style.pointerEvents = "auto";
                if (chartInstance) {
                    chartInstance.resize();
                }
            }
        });
    });

    // 2. タイムフレーム切替
    const tabs = document.querySelectorAll("#timeframeTabs .tab-btn");
    tabs.forEach(tab => {
        tab.addEventListener("click", (e) => {
            tabs.forEach(t => t.classList.remove("active"));
            e.target.classList.add("active");

            currentTf = e.target.getAttribute("data-tf");
            selectedTicker = null; // リセット
            renderDashboard(currentTf);
        });
    });

    // 3. 全体AI診断リセットボタン
    const resetAiBtn = document.getElementById("resetAiBtn");
    if (resetAiBtn) {
        resetAiBtn.addEventListener("click", () => {
            selectedTicker = null;
            renderAiSummary(currentTf);
        });
    }

    // 4. サンキーノード/リンククリックイベント（ドリルダウン & 個別AI診断切替）
    chartInstance.on("click", (params) => {
        if (params.dataType === "node") {
            const ticker = params.data.ticker;
            if (ticker) {
                selectedTicker = ticker;
                renderDrilldown(ticker);
                renderAiSummary(currentTf, ticker);
            } else {
                const tickerMatch = params.data.name.match(/\(([^()]+)\)[^()]*$/);
                if (tickerMatch && tickerMatch[1]) {
                    selectedTicker = tickerMatch[1];
                    renderDrilldown(tickerMatch[1]);
                    renderAiSummary(currentTf, tickerMatch[1]);
                }
            }
        }
    });
}

// ダッシュボード全体の描画
function renderDashboard(tf) {
    if (!currentData || !currentData[tf]) return;

    const tfData = currentData[tf];

    // 0. 最新データ更新日時のバッジ表示
    const badgeEl = document.getElementById("lastUpdatedBadge");
    if (badgeEl && tfData.last_updated) {
        badgeEl.innerText = `🕒 データ更新: ${tfData.last_updated} (市場確定日: ${tfData.market_date || '最新'})`;
    }

    // 1. サンキーダイアグラムの描画
    renderSankey(tfData.nodes, tfData.links);

    // 2. Gemini AI相棒解説の更新 (全般または選択中個別)
    renderAiSummary(tf, selectedTicker);

    // 3. デフォルトのドリルダウン（例: IGV）を表示
    const defaultTicker = selectedTicker || "IGV";
    if (tfData.sectors[defaultTicker]) {
        renderDrilldown(defaultTicker);
    }
}

// AI相棒診断の描画（全体 vs 個別ETF切り替え）
function renderAiSummary(tf, ticker = null) {
    if (!currentData || !currentData[tf]) return;

    const tfData = currentData[tf];
    const aiTitleEl = document.getElementById("aiTitle");
    const aiSpeechEl = document.getElementById("aiSpeechText");

    if (ticker && tfData.sector_ai_summaries && tfData.sector_ai_summaries[ticker]) {
        const sectorName = tfData.sectors[ticker] ? tfData.sectors[ticker].name : ticker;
        aiTitleEl.innerHTML = `Gem相棒の冷徹なマーケット診断 <span style="color: #60A5FA;">（選択中: ${sectorName} [${ticker}]）</span>`;
        aiSpeechEl.innerText = tfData.sector_ai_summaries[ticker];
    } else {
        aiTitleEl.innerText = "Gem相棒の冷徹なマーケット診断（全般マーケット）";
        aiSpeechEl.innerText = tfData.ai_summary;
    }
}

// ECharts サンキーダイアグラムの描画
function renderSankey(nodes, links) {
    const formattedNodes = nodes.map(n => ({
        name: n.name,
        ticker: n.ticker,
        itemStyle: {
            color: n.price_change >= 0 ? 
                (n.quality === "REAL_BUY" ? "#10B981" : "#F59E0B") : 
                "#EF4444",
            borderColor: "rgba(255, 255, 255, 0.2)",
            borderWidth: 1
        }
    }));

    const formattedLinks = links.map(l => ({
        source: l.source,
        target: l.target,
        value: l.value,
        lineStyle: {
            color: l.quality_color,
            opacity: 0.35,
            curveness: 0.5
        }
    }));

    const option = {
        tooltip: {
            trigger: "item",
            triggerOn: "mousemove",
            formatter: (params) => {
                if (params.dataType === "edge") {
                    return `
                        <div style="font-family: Inter, sans-serif; padding: 4px;">
                            <strong style="color: ${params.data.lineStyle.color};">${params.data.source} ➔ ${params.data.target}</strong><br/>
                            推定資金移動量: <strong>$${params.data.value} Billion</strong><br/>
                            資金の質: <strong>${params.data.quality_label || ''}</strong>
                        </div>
                    `;
                } else {
                    return `
                        <div style="font-family: Inter, sans-serif; padding: 4px;">
                            <strong>${params.name}</strong><br/>
                            クリックして個別分析 ＆ AI診断を切り替え
                        </div>
                    `;
                }
            }
        },
        series: [
            {
                type: "sankey",
                data: formattedNodes,
                links: formattedLinks,
                emphasis: {
                    focus: "adjacency"
                },
                nodeWidth: 16,
                nodeGap: 12,
                label: {
                    color: "#F3F4F6",
                    fontFamily: "Inter, sans-serif",
                    fontSize: 11,
                    fontWeight: 600
                },
                lineStyle: {
                    color: "gradient",
                    curveness: 0.5
                }
            }
        ]
    };

    chartInstance.setOption(option, true);
}

// ドリルダウンパネルの描画
function renderDrilldown(ticker) {
    const tfData = currentData[currentTf];
    if (!tfData) return;

    const sectorInfo = tfData.sectors[ticker];
    if (!sectorInfo) return;

    const titleEl = document.getElementById("drilldownTitle");
    const bodyEl = document.getElementById("drilldownBody");

    titleEl.innerHTML = `🔍 判定詳細: <span style="color: #60A5FA;">${sectorInfo.name} (${ticker})</span>`;

    const priceColor = sectorInfo.price_change >= 0 ? "#10B981" : "#EF4444";
    const oiColor = sectorInfo.oi_change >= 0 ? "#10B981" : "#F59E0B";

    let metricsHtml = `
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-label">騰落率 (Price)</div>
                <div class="metric-value" style="color: ${priceColor};">${sectorInfo.price_change > 0 ? '+' : ''}${sectorInfo.price_change}%</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">建玉(OI) 変化</div>
                <div class="metric-value" style="color: ${oiColor};">${sectorInfo.oi_change > 0 ? '+' : ''}${sectorInfo.oi_change}%</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Short Volume比</div>
                <div class="metric-value" style="color: #60A5FA;">${sectorInfo.short_vol_ratio}%</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">判定結果 (Quality)</div>
                <div class="metric-value" style="color: ${sectorInfo.quality_color}; font-size: 0.85rem;">${sectorInfo.quality_label}</div>
            </div>
        </div>
    `;

    let tableRows = "";
    sectorInfo.components.forEach(comp => {
        const detail = tfData.stock_details[comp];
        if (detail) {
            const badgeClass = detail.quality === "REAL_BUY" ? "bg-real" : 
                              (detail.quality === "SHORT_COVER" ? "bg-short" : "bg-short-new");
            const cPriceColor = detail.price_change >= 0 ? "#10B981" : "#EF4444";

            tableRows += `
                <tr>
                    <td><strong>${comp}</strong></td>
                    <td style="color: ${cPriceColor}; font-weight: 600;">${detail.price_change > 0 ? '+' : ''}${detail.price_change}%</td>
                    <td>${detail.oi_change > 0 ? '+' : ''}${detail.oi_change}%</td>
                    <td>${detail.short_vol_ratio}%</td>
                    <td><span class="stock-badge ${badgeClass}">${detail.quality_label}</span></td>
                </tr>
            `;
        }
    });

    let tableHtml = `
        <h4 style="font-size: 0.8rem; color: #9CA3AF; margin-top: 0.8rem; margin-bottom: 0.4rem;">構成主要銘柄の4ファクト内訳:</h4>
        <table class="stock-table">
            <thead>
                <tr>
                    <th>ティッカー</th>
                    <th>株価変動</th>
                    <th>OI変化</th>
                    <th>Short Vol</th>
                    <th>ファクト判定</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    `;

    bodyEl.innerHTML = metricsHtml + tableHtml;
}
