/* ═══════════════════════════════════════════════ */
/*  BRAINSTORM — DECISION ENGINE                    */
/*  Core Logic: Nodes, Links, Risk Detection,       */
/*  Weekly Updates, Graph Visualization              */
/* ═══════════════════════════════════════════════ */

(function () {
    'use strict';

    // ─── STATE ────────────────────────────────────────
    const STORAGE_KEY = 'brainstorm_engine_v2';
    const WEEKLY_KEY  = 'brainstorm_weekly_v2';

    let state = {
        nodes: [],
        weeklyUpdates: [],
        lastWeeklyDate: null,
    };

    let editingNodeId = null;
    let currentFilter = 'all';
    let currentSort = 'created';
    let searchQuery = '';

    // Category meta
    const CATEGORIES = {
        strateji:     { label: 'Stratejik Tanım',       color: '#6366f1' },
        pazar:        { label: 'Pazar & Dış Analiz',     color: '#38bdf8' },
        urun:         { label: 'Ürün / Hizmet',          color: '#34d399' },
        teknik:       { label: 'Teknik Mimari',          color: '#a78bfa' },
        operasyon:    { label: 'Operasyon',              color: '#fb923c' },
        finans:       { label: 'Finansal Model',         color: '#fbbf24' },
        risk:         { label: 'Risk & Senaryo',         color: '#f43f5e' },
        gtm:          { label: 'Go-To-Market',           color: '#ec4899' },
        olcum:        { label: 'Ölçüm & Optimizasyon',   color: '#14b8a6' },
        yolharitasi:  { label: 'Yol Haritası',           color: '#8b5cf6' },
        yonetim:      { label: 'Yönetim & Karar',        color: '#64748b' },
    };

    const LINK_TYPES = {
        affects:   { label: '→ etkiler',    color: '#6366f1' },
        depends:   { label: '← bağımlı',    color: '#fbbf24' },
        conflicts: { label: '⚡ çelişir',   color: '#f43f5e' },
        supports:  { label: '✓ destekler',  color: '#34d399' },
        feeds:     { label: '⟶ besler',     color: '#38bdf8' },
    };

    // ─── PERSISTENCE ─────────────────────────────────
    function save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.error('Save failed:', e);
        }
    }

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                state = { ...state, ...parsed };
            }
        } catch (e) {
            console.error('Load failed:', e);
        }
    }

    // ─── UTILS ───────────────────────────────────────
    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function formatDate(ts) {
        if (!ts) return '—';
        const d = new Date(ts);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        return `${day}.${month}.${year} ${hours}:${mins}`;
    }

    function daysSince(ts) {
        if (!ts) return Infinity;
        return Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
    }

    function truncate(str, len = 60) {
        if (!str) return '';
        return str.length > len ? str.slice(0, len) + '…' : str;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Is a node "risk"? → evidence is empty
    function isRisk(node) {
        return !node.evidence || node.evidence.trim() === '';
    }

    // Is a node "decided"? → decision is filled
    function isDecided(node) {
        return node.decision && node.decision.trim().length > 0;
    }

    // Is a node "open"? → assumption filled but no decision
    function isOpen(node) {
        return node.assumption && node.assumption.trim().length > 0 && !isDecided(node);
    }

    // Is a node "stale"? → not updated in 7+ days
    function isStale(node) {
        return daysSince(node.updatedAt) >= 7;
    }

    // ─── TOAST ───────────────────────────────────────
    function toast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;

        const icons = {
            success: '✓',
            warning: '⚠',
            error: '✕',
            info: 'ℹ',
        };

        el.innerHTML = `
            <span class="toast-icon">${icons[type] || 'ℹ'}</span>
            <span>${escapeHtml(message)}</span>
        `;

        container.appendChild(el);

        setTimeout(() => {
            el.classList.add('toast-out');
            setTimeout(() => el.remove(), 300);
        }, 3000);
    }

    // ─── NODE OPERATIONS ─────────────────────────────
    function createNode(title = '', category = 'strateji') {
        const node = {
            id: uid(),
            title: title,
            category: category,
            assumption: '',
            evidence: '',
            decision: '',
            qWrong: '',
            qAffects: '',
            qVerify: '',
            links: [], // { targetId, type }
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        state.nodes.push(node);
        save();
        return node;
    }

    function updateNode(id, updates) {
        const idx = state.nodes.findIndex(n => n.id === id);
        if (idx === -1) return;
        state.nodes[idx] = { ...state.nodes[idx], ...updates, updatedAt: Date.now() };
        save();
    }

    function deleteNode(id) {
        state.nodes = state.nodes.filter(n => n.id !== id);
        // Remove links to this node from other nodes
        state.nodes.forEach(n => {
            n.links = n.links.filter(l => l.targetId !== id);
        });
        save();
    }

    function getNode(id) {
        return state.nodes.find(n => n.id === id);
    }

    function getNodeIndex(id) {
        return state.nodes.findIndex(n => n.id === id);
    }

    // ─── FILTERING & SORTING ─────────────────────────
    function getFilteredNodes() {
        let nodes = [...state.nodes];

        // Search
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            nodes = nodes.filter(n =>
                (n.title && n.title.toLowerCase().includes(q)) ||
                (n.assumption && n.assumption.toLowerCase().includes(q)) ||
                (n.evidence && n.evidence.toLowerCase().includes(q)) ||
                (n.decision && n.decision.toLowerCase().includes(q)) ||
                (CATEGORIES[n.category] && CATEGORIES[n.category].label.toLowerCase().includes(q))
            );
        }

        // Filter
        switch (currentFilter) {
            case 'risk':
                nodes = nodes.filter(isRisk);
                break;
            case 'decided':
                nodes = nodes.filter(isDecided);
                break;
            case 'open':
                nodes = nodes.filter(isOpen);
                break;
            case 'evidence':
                nodes = nodes.filter(n => !isRisk(n));
                break;
        }

        // Sort
        switch (currentSort) {
            case 'created':
                nodes.sort((a, b) => b.createdAt - a.createdAt);
                break;
            case 'updated':
                nodes.sort((a, b) => b.updatedAt - a.updatedAt);
                break;
            case 'risk':
                nodes.sort((a, b) => {
                    const aScore = (isRisk(a) ? 100 : 0) + (isStale(a) ? 50 : 0) - (isDecided(a) ? 25 : 0);
                    const bScore = (isRisk(b) ? 100 : 0) + (isStale(b) ? 50 : 0) - (isDecided(b) ? 25 : 0);
                    return bScore - aScore;
                });
                break;
            case 'links':
                nodes.sort((a, b) => (b.links?.length || 0) - (a.links?.length || 0));
                break;
        }

        return nodes;
    }

    // ─── STATS ───────────────────────────────────────
    function updateStats() {
        const total = state.nodes.length;
        const riskCount = state.nodes.filter(isRisk).length;
        const decidedCount = state.nodes.filter(isDecided).length;
        const linksCount = state.nodes.reduce((sum, n) => sum + (n.links?.length || 0), 0);

        document.getElementById('statTotal').textContent = total;
        document.getElementById('statRisk').textContent = riskCount;
        document.getElementById('statDecided').textContent = decidedCount;
        document.getElementById('statLinks').textContent = linksCount;
    }

    // ─── RENDER NODE GRID ────────────────────────────
    function renderGrid() {
        const grid = document.getElementById('nodeGrid');
        const empty = document.getElementById('emptyState');
        const nodes = getFilteredNodes();

        if (state.nodes.length === 0) {
            grid.style.display = 'none';
            empty.classList.add('visible');
            document.getElementById('filterBar').style.display = 'none';
            return;
        }

        grid.style.display = 'grid';
        empty.classList.remove('visible');
        document.getElementById('filterBar').style.display = 'flex';

        if (nodes.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 48px; color: var(--text-muted);">
                    <p>Bu filtreyle eşleşen node bulunamadı.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = nodes.map((node, idx) => {
            const cat = CATEGORIES[node.category] || CATEGORIES.strateji;
            const riskClass = isRisk(node) ? 'is-risk' : '';
            const decidedClass = isDecided(node) ? 'is-decided' : '';
            const nodeNum = String(getNodeIndex(node.id) + 1).padStart(2, '0');

            // Build tags
            let tags = '';
            if (isRisk(node)) tags += `<span class="card-tag card-tag--risk">⚠ risk</span>`;
            if (isDecided(node)) tags += `<span class="card-tag card-tag--decided">✓ karar</span>`;
            if (isOpen(node)) tags += `<span class="card-tag card-tag--open">? açık</span>`;
            if (isStale(node)) tags += `<span class="card-tag card-tag--stale">⏱ güncelle</span>`;
            if (node.links?.length > 0) tags += `<span class="card-tag card-tag--links">🔗 ${node.links.length}</span>`;

            // Block previews
            const assumptionPreview = node.assumption
                ? `<span class="card-block-preview">${escapeHtml(truncate(node.assumption, 50))}</span>`
                : `<span class="card-block-preview card-block-empty">tanımlanmadı</span>`;

            const evidencePreview = node.evidence
                ? `<span class="card-block-preview">${escapeHtml(truncate(node.evidence, 50))}</span>`
                : `<span class="card-block-preview card-block-empty">kanıt yok → risk</span>`;

            const decisionPreview = node.decision
                ? `<span class="card-block-preview">${escapeHtml(truncate(node.decision, 50))}</span>`
                : `<span class="card-block-preview card-block-empty">karar bekliyor</span>`;

            // Link dots
            let linkDots = '';
            if (node.links?.length > 0) {
                linkDots = node.links.slice(0, 5).map(l => {
                    const linked = getNode(l.targetId);
                    const lcol = linked ? (CATEGORIES[linked.category]?.color || '#6366f1') : '#555';
                    return `<span class="card-link-dot" style="border-color: ${lcol};" title="${linked ? linked.title : 'Silinmiş'}"></span>`;
                }).join('');
            }

            return `
                <div class="node-card ${riskClass} ${decidedClass}"
                     style="--card-accent: ${cat.color}; --card-accent-soft: ${cat.color}22; animation-delay: ${idx * 40}ms;"
                     data-id="${node.id}">
                    <div class="card-header">
                        <span class="card-number">${nodeNum}</span>
                        <span class="card-title">${escapeHtml(node.title || 'Başlıksız Node')}</span>
                        <span class="card-category">${cat.label}</span>
                    </div>
                    <div class="card-blocks">
                        <div class="card-block-row">
                            <span class="card-block-label assumption">Varsayım</span>
                            ${assumptionPreview}
                        </div>
                        <div class="card-block-row">
                            <span class="card-block-label evidence">Kanıt</span>
                            ${evidencePreview}
                        </div>
                        <div class="card-block-row">
                            <span class="card-block-label decision">Karar</span>
                            ${decisionPreview}
                        </div>
                    </div>
                    <div class="card-tags">${tags}</div>
                    <div class="card-footer">
                        <span class="card-timestamp">${formatDate(node.updatedAt)}</span>
                        <div class="card-link-dots">${linkDots}</div>
                    </div>
                </div>
            `;
        }).join('');

        // Card click handlers
        grid.querySelectorAll('.node-card').forEach(card => {
            card.addEventListener('click', () => {
                openNodeModal(card.dataset.id);
            });
        });

        updateStats();
    }

    // ─── NODE MODAL ──────────────────────────────────
    function openNodeModal(id) {
        const node = getNode(id);
        if (!node) return;
        editingNodeId = id;

        const modal = document.getElementById('nodeModal');
        const nodeNum = String(getNodeIndex(id) + 1).padStart(2, '0');

        document.getElementById('modalNumber').textContent = nodeNum;
        document.getElementById('modalTitle').value = node.title || '';
        document.getElementById('modalCategory').value = node.category || 'strateji';
        document.getElementById('blockAssumption').value = node.assumption || '';
        document.getElementById('blockEvidence').value = node.evidence || '';
        document.getElementById('blockDecision').value = node.decision || '';
        document.getElementById('qWrong').value = node.qWrong || '';
        document.getElementById('qAffects').value = node.qAffects || '';
        document.getElementById('qVerify').value = node.qVerify || '';

        document.getElementById('tsCreated').textContent = `Oluşturma: ${formatDate(node.createdAt)}`;
        document.getElementById('tsUpdated').textContent = `Güncelleme: ${formatDate(node.updatedAt)}`;

        updateEvidenceStatus(node.evidence);
        renderCrossLinks(node);

        modal.classList.add('open');
        document.getElementById('modalTitle').focus();
    }

    function closeNodeModal() {
        document.getElementById('nodeModal').classList.remove('open');
        editingNodeId = null;
    }

    function saveCurrentNode() {
        if (!editingNodeId) return;

        const updates = {
            title: document.getElementById('modalTitle').value.trim(),
            category: document.getElementById('modalCategory').value,
            assumption: document.getElementById('blockAssumption').value.trim(),
            evidence: document.getElementById('blockEvidence').value.trim(),
            decision: document.getElementById('blockDecision').value.trim(),
            qWrong: document.getElementById('qWrong').value.trim(),
            qAffects: document.getElementById('qAffects').value.trim(),
            qVerify: document.getElementById('qVerify').value.trim(),
        };

        updateNode(editingNodeId, updates);
        renderGrid();
        closeNodeModal();
        toast('Node kaydedildi', 'success');
    }

    function deleteCurrentNode() {
        if (!editingNodeId) return;
        const node = getNode(editingNodeId);
        if (!node) return;

        if (confirm(`"${node.title || 'Başlıksız Node'}" silinecek. Emin misin?`)) {
            deleteNode(editingNodeId);
            closeNodeModal();
            renderGrid();
            toast('Node silindi', 'warning');
        }
    }

    function updateEvidenceStatus(evidenceText) {
        const statusEl = document.getElementById('evidenceStatus');
        if (evidenceText && evidenceText.trim()) {
            statusEl.innerHTML = `<span class="evidence-badge evidence-badge--has">Kanıt Var ✓</span>`;
        } else {
            statusEl.innerHTML = `<span class="evidence-badge evidence-badge--empty">Kanıt Yok — RİSK</span>`;
        }
    }

    // ─── CROSS LINKS ─────────────────────────────────
    function renderCrossLinks(node) {
        const list = document.getElementById('crossLinksList');
        const countEl = document.getElementById('linkCount');

        if (!node.links || node.links.length === 0) {
            list.innerHTML = `<div style="text-align: center; padding: 12px; color: var(--text-muted); font-size: 0.8rem;">Henüz bağlantı yok</div>`;
            countEl.textContent = '0';
            return;
        }

        countEl.textContent = node.links.length;

        list.innerHTML = node.links.map(link => {
            const target = getNode(link.targetId);
            const linkMeta = LINK_TYPES[link.type] || LINK_TYPES.affects;

            if (!target) {
                return `
                    <div class="cross-link-item" style="opacity: 0.5;">
                        <span class="cross-link-type">${linkMeta.label}</span>
                        <span class="cross-link-name" style="font-style: italic; color: var(--text-muted);">Silinmiş Node</span>
                        <span class="cross-link-remove" data-target="${link.targetId}" title="Kaldır">✕</span>
                    </div>
                `;
            }

            const cat = CATEGORIES[target.category] || CATEGORIES.strateji;
            return `
                <div class="cross-link-item">
                    <span class="cross-link-type" style="background: ${linkMeta.color}22; color: ${linkMeta.color};">${linkMeta.label}</span>
                    <span class="cross-link-name">${escapeHtml(target.title || 'Başlıksız')}</span>
                    <span style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase;">${cat.label}</span>
                    <span class="cross-link-remove" data-target="${link.targetId}" title="Kaldır">✕</span>
                </div>
            `;
        }).join('');

        // Remove link handlers
        list.querySelectorAll('.cross-link-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const targetId = btn.dataset.target;
                const node = getNode(editingNodeId);
                if (node) {
                    node.links = node.links.filter(l => l.targetId !== targetId);
                    updateNode(editingNodeId, { links: node.links });
                    renderCrossLinks(getNode(editingNodeId));
                    renderGrid();
                    toast('Bağlantı kaldırıldı', 'info');
                }
            });
        });
    }

    // ─── LINK PICKER ─────────────────────────────────
    function openLinkPicker() {
        if (!editingNodeId) return;
        const modal = document.getElementById('linkPickerModal');
        document.getElementById('linkPickerSearch').value = '';
        renderLinkPickerList('');
        modal.classList.add('open');
        document.getElementById('linkPickerSearch').focus();
    }

    function closeLinkPicker() {
        document.getElementById('linkPickerModal').classList.remove('open');
    }

    function renderLinkPickerList(query) {
        const list = document.getElementById('linkPickerList');
        const currentNode = getNode(editingNodeId);
        if (!currentNode) return;

        const existingIds = new Set((currentNode.links || []).map(l => l.targetId));
        let candidates = state.nodes.filter(n => n.id !== editingNodeId && !existingIds.has(n.id));

        if (query.trim()) {
            const q = query.toLowerCase();
            candidates = candidates.filter(n =>
                (n.title && n.title.toLowerCase().includes(q)) ||
                (CATEGORIES[n.category] && CATEGORIES[n.category].label.toLowerCase().includes(q))
            );
        }

        if (candidates.length === 0) {
            list.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 0.82rem;">Bağlanabilecek node bulunamadı</div>`;
            return;
        }

        list.innerHTML = candidates.map(n => {
            const cat = CATEGORIES[n.category] || CATEGORIES.strateji;
            return `
                <div class="link-picker-item" data-id="${n.id}">
                    <span class="lp-dot" style="background: ${cat.color};"></span>
                    <span class="lp-title">${escapeHtml(n.title || 'Başlıksız')}</span>
                    <span class="lp-cat">${cat.label}</span>
                </div>
            `;
        }).join('');

        list.querySelectorAll('.link-picker-item').forEach(item => {
            item.addEventListener('click', () => {
                addLink(item.dataset.id);
            });
        });
    }

    function addLink(targetId) {
        if (!editingNodeId) return;
        const node = getNode(editingNodeId);
        if (!node) return;

        const linkType = document.getElementById('linkType').value;

        if (!node.links) node.links = [];
        node.links.push({ targetId, type: linkType });
        updateNode(editingNodeId, { links: node.links });

        closeLinkPicker();
        renderCrossLinks(getNode(editingNodeId));
        renderGrid();
        toast('Bağlantı eklendi', 'success');
    }

    // ─── WEEKLY UPDATE ───────────────────────────────
    function openWeeklyModal() {
        const modal = document.getElementById('weeklyModal');

        // Set current date
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
        document.getElementById('weeklyDate').textContent =
            `Hafta: ${formatDate(weekStart.getTime()).split(' ')[0]} — ${formatDate(now.getTime()).split(' ')[0]}`;

        // Clear inputs
        document.getElementById('weeklyChanged').value = '';
        document.getElementById('weeklyCollapsed').value = '';
        document.getElementById('weeklyNewDecision').value = '';

        // Render stale nodes
        renderWeeklyReviewList();
        renderWeeklyHistory();

        modal.classList.add('open');
    }

    function closeWeeklyModal() {
        document.getElementById('weeklyModal').classList.remove('open');
    }

    function renderWeeklyReviewList() {
        const list = document.getElementById('weeklyReviewList');
        const staleNodes = state.nodes.filter(isStale);

        if (staleNodes.length === 0) {
            list.innerHTML = `<div style="padding: 12px; color: var(--emerald); font-size: 0.82rem;">✓ Tüm node'lar güncel!</div>`;
            return;
        }

        list.innerHTML = staleNodes.map(n => {
            const days = daysSince(n.updatedAt);
            return `
                <div class="weekly-review-item">
                    <span class="wr-name">${escapeHtml(n.title || 'Başlıksız')}</span>
                    <span class="wr-days">${days} gün önce</span>
                </div>
            `;
        }).join('');
    }

    function renderWeeklyHistory() {
        const list = document.getElementById('weeklyHistoryList');
        const history = document.getElementById('weeklyHistory');

        if (!state.weeklyUpdates || state.weeklyUpdates.length === 0) {
            history.style.display = 'none';
            return;
        }

        history.style.display = 'block';

        list.innerHTML = state.weeklyUpdates.slice(0, 10).map(entry => {
            return `
                <div class="weekly-history-entry">
                    <div class="wh-date">${formatDate(entry.date)}</div>
                    <div class="wh-content">
                        ${entry.changed ? `<div><strong>Değişen:</strong> ${escapeHtml(truncate(entry.changed, 120))}</div>` : ''}
                        ${entry.collapsed ? `<div><strong>Çöken Varsayım:</strong> ${escapeHtml(truncate(entry.collapsed, 120))}</div>` : ''}
                        ${entry.newDecision ? `<div><strong>Yeni Karar:</strong> ${escapeHtml(truncate(entry.newDecision, 120))}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    function saveWeeklyUpdate() {
        const changed = document.getElementById('weeklyChanged').value.trim();
        const collapsed = document.getElementById('weeklyCollapsed').value.trim();
        const newDecision = document.getElementById('weeklyNewDecision').value.trim();

        if (!changed && !collapsed && !newDecision) {
            toast('En az bir alan doldurulmalı', 'warning');
            return;
        }

        if (!state.weeklyUpdates) state.weeklyUpdates = [];

        state.weeklyUpdates.unshift({
            date: Date.now(),
            changed,
            collapsed,
            newDecision,
        });

        state.lastWeeklyDate = Date.now();
        save();

        closeWeeklyModal();
        toast('Haftalık güncelleme kaydedildi', 'success');
    }

    // ─── GRAPH VIEW ──────────────────────────────────
    function openGraphModal() {
        const modal = document.getElementById('graphModal');
        modal.classList.add('open');
        setTimeout(renderGraph, 100);
    }

    function closeGraphModal() {
        document.getElementById('graphModal').classList.remove('open');
    }

    function renderGraph() {
        const canvas = document.getElementById('graphCanvas');
        const ctx = canvas.getContext('2d');
        const rect = canvas.parentElement.getBoundingClientRect();

        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = (rect.height - 56) * window.devicePixelRatio;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = (rect.height - 56) + 'px';
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        const W = rect.width;
        const H = rect.height - 56;

        if (state.nodes.length === 0) {
            ctx.fillStyle = '#55556a';
            ctx.font = '14px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('Grafik göstermek için node oluşturun', W / 2, H / 2);
            return;
        }

        // Force-directed layout simulation
        const nodes = state.nodes.map((n, i) => {
            const angle = (i / state.nodes.length) * Math.PI * 2;
            const radius = Math.min(W, H) * 0.3;
            return {
                id: n.id,
                x: W / 2 + Math.cos(angle) * radius + (Math.random() - 0.5) * 40,
                y: H / 2 + Math.sin(angle) * radius + (Math.random() - 0.5) * 40,
                vx: 0,
                vy: 0,
                data: n,
            };
        });

        const nodeMap = {};
        nodes.forEach(n => nodeMap[n.id] = n);

        // Collect edges
        const edges = [];
        state.nodes.forEach(n => {
            if (n.links) {
                n.links.forEach(l => {
                    if (nodeMap[l.targetId]) {
                        edges.push({
                            source: n.id,
                            target: l.targetId,
                            type: l.type,
                        });
                    }
                });
            }
        });

        // Simple force simulation (50 iterations)
        for (let iter = 0; iter < 80; iter++) {
            // Repulsion between all nodes
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    let dx = nodes[j].x - nodes[i].x;
                    let dy = nodes[j].y - nodes[i].y;
                    let dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    let force = 2000 / (dist * dist);
                    let fx = dx / dist * force;
                    let fy = dy / dist * force;
                    nodes[i].vx -= fx;
                    nodes[i].vy -= fy;
                    nodes[j].vx += fx;
                    nodes[j].vy += fy;
                }
            }

            // Attraction along edges
            edges.forEach(e => {
                const s = nodeMap[e.source];
                const t = nodeMap[e.target];
                if (!s || !t) return;
                let dx = t.x - s.x;
                let dy = t.y - s.y;
                let dist = Math.sqrt(dx * dx + dy * dy) || 1;
                let force = (dist - 120) * 0.02;
                let fx = dx / dist * force;
                let fy = dy / dist * force;
                s.vx += fx;
                s.vy += fy;
                t.vx -= fx;
                t.vy -= fy;
            });

            // Center gravity
            nodes.forEach(n => {
                n.vx += (W / 2 - n.x) * 0.003;
                n.vy += (H / 2 - n.y) * 0.003;
            });

            // Move
            nodes.forEach(n => {
                n.vx *= 0.85;
                n.vy *= 0.85;
                n.x += n.vx;
                n.y += n.vy;
                // Bounds
                n.x = Math.max(50, Math.min(W - 50, n.x));
                n.y = Math.max(50, Math.min(H - 50, n.y));
            });
        }

        // Clear
        ctx.clearRect(0, 0, W, H);

        // Draw edges
        edges.forEach(e => {
            const s = nodeMap[e.source];
            const t = nodeMap[e.target];
            if (!s || !t) return;

            const linkMeta = LINK_TYPES[e.type] || LINK_TYPES.affects;

            ctx.beginPath();
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(t.x, t.y);
            ctx.strokeStyle = linkMeta.color + '60';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Arrow
            const angle = Math.atan2(t.y - s.y, t.x - s.x);
            const arrowDist = 25;
            const ax = t.x - Math.cos(angle) * arrowDist;
            const ay = t.y - Math.sin(angle) * arrowDist;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax - 8 * Math.cos(angle - 0.4), ay - 8 * Math.sin(angle - 0.4));
            ctx.lineTo(ax - 8 * Math.cos(angle + 0.4), ay - 8 * Math.sin(angle + 0.4));
            ctx.closePath();
            ctx.fillStyle = linkMeta.color + '80';
            ctx.fill();
        });

        // Draw nodes
        nodes.forEach(n => {
            const cat = CATEGORIES[n.data.category] || CATEGORIES.strateji;
            const r = 20;

            // Glow for risk nodes
            if (isRisk(n.data)) {
                ctx.beginPath();
                ctx.arc(n.x, n.y, r + 8, 0, Math.PI * 2);
                const grad = ctx.createRadialGradient(n.x, n.y, r, n.x, n.y, r + 8);
                grad.addColorStop(0, 'rgba(244, 63, 94, 0.15)');
                grad.addColorStop(1, 'rgba(244, 63, 94, 0)');
                ctx.fillStyle = grad;
                ctx.fill();
            }

            // Node circle
            ctx.beginPath();
            ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
            ctx.fillStyle = cat.color + '33';
            ctx.fill();
            ctx.strokeStyle = cat.color;
            ctx.lineWidth = isRisk(n.data) ? 2.5 : 1.5;
            ctx.stroke();

            // Inner dot
            ctx.beginPath();
            ctx.arc(n.x, n.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = cat.color;
            ctx.fill();

            // Label
            ctx.fillStyle = '#e8e8ed';
            ctx.font = '500 11px Inter';
            ctx.textAlign = 'center';
            const label = truncate(n.data.title || 'Başlıksız', 20);
            ctx.fillText(label, n.x, n.y + r + 16);
        });
    }

    // ─── SEARCH ──────────────────────────────────────
    function handleSearch(e) {
        searchQuery = e.target.value;
        renderGrid();
    }

    // ─── INIT ────────────────────────────────────────
    function init() {
        load();

        // Render
        renderGrid();
        updateStats();

        // Event Listeners

        // Add node
        document.getElementById('btnAddNode').addEventListener('click', () => {
            const node = createNode();
            renderGrid();
            openNodeModal(node.id);
        });

        document.getElementById('btnEmptyAdd').addEventListener('click', () => {
            const node = createNode();
            renderGrid();
            openNodeModal(node.id);
        });

        // Close modals
        document.getElementById('btnCloseModal').addEventListener('click', closeNodeModal);
        document.getElementById('nodeModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeNodeModal();
        });

        // Save & Delete
        document.getElementById('btnSaveNode').addEventListener('click', saveCurrentNode);
        document.getElementById('btnDeleteNode').addEventListener('click', deleteCurrentNode);

        // Evidence status live update
        document.getElementById('blockEvidence').addEventListener('input', (e) => {
            updateEvidenceStatus(e.target.value);
        });

        // Cross links
        document.getElementById('btnAddLink').addEventListener('click', openLinkPicker);
        document.getElementById('btnCloseLinkPicker').addEventListener('click', closeLinkPicker);
        document.getElementById('linkPickerModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeLinkPicker();
        });
        document.getElementById('linkPickerSearch').addEventListener('input', (e) => {
            renderLinkPickerList(e.target.value);
        });

        // Weekly
        document.getElementById('btnWeeklyUpdate').addEventListener('click', openWeeklyModal);
        document.getElementById('btnCloseWeekly').addEventListener('click', closeWeeklyModal);
        document.getElementById('weeklyModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeWeeklyModal();
        });
        document.getElementById('btnSaveWeekly').addEventListener('click', saveWeeklyUpdate);

        // Graph
        document.getElementById('btnGraphView').addEventListener('click', openGraphModal);
        document.getElementById('btnCloseGraph').addEventListener('click', closeGraphModal);
        document.getElementById('graphModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeGraphModal();
        });

        // Filters
        document.querySelectorAll('.filter-chip[data-filter]').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.filter-chip[data-filter]').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                currentFilter = chip.dataset.filter;
                renderGrid();
            });
        });

        // Sort
        document.getElementById('sortBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('sortMenu').classList.toggle('open');
        });

        document.querySelectorAll('#sortMenu button').forEach(btn => {
            btn.addEventListener('click', () => {
                currentSort = btn.dataset.sort;
                document.getElementById('sortMenu').classList.remove('open');
                renderGrid();
                toast(`Sıralama: ${btn.textContent}`, 'info');
            });
        });

        document.addEventListener('click', () => {
            document.getElementById('sortMenu').classList.remove('open');
        });

        // Search
        document.getElementById('searchInput').addEventListener('input', handleSearch);

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Escape closes modals
            if (e.key === 'Escape') {
                if (document.getElementById('linkPickerModal').classList.contains('open')) {
                    closeLinkPicker();
                } else if (document.getElementById('weeklyModal').classList.contains('open')) {
                    closeWeeklyModal();
                } else if (document.getElementById('graphModal').classList.contains('open')) {
                    closeGraphModal();
                } else if (document.getElementById('nodeModal').classList.contains('open')) {
                    closeNodeModal();
                }
            }

            // Ctrl+N = New node
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                const node = createNode();
                renderGrid();
                openNodeModal(node.id);
            }

            // Ctrl+K = Search focus
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                document.getElementById('searchInput').focus();
            }

            // Ctrl+S = Save (in modal)
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                if (document.getElementById('nodeModal').classList.contains('open')) {
                    e.preventDefault();
                    saveCurrentNode();
                }
            }
        });

        // Weekly update reminder
        checkWeeklyReminder();

        // Window resize for graph
        window.addEventListener('resize', () => {
            if (document.getElementById('graphModal').classList.contains('open')) {
                renderGraph();
            }
        });
    }

    function checkWeeklyReminder() {
        if (state.nodes.length === 0) return;

        const lastWeekly = state.lastWeeklyDate;
        if (!lastWeekly || daysSince(lastWeekly) >= 7) {
            setTimeout(() => {
                toast('📅 Haftalık güncelleme zamanı! Takvim butonuna tıkla.', 'warning');

                // Pulse the weekly button
                const btn = document.getElementById('btnWeeklyUpdate');
                btn.style.animation = 'riskPulse 1.5s ease-in-out infinite';
                btn.style.color = 'var(--amber)';
            }, 2000);
        }

        // Check for stale nodes
        const staleCount = state.nodes.filter(isStale).length;
        if (staleCount > 0) {
            setTimeout(() => {
                toast(`⏱ ${staleCount} node 7+ gündür güncellenmedi`, 'warning');
            }, 4000);
        }
    }

    // Boot
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
