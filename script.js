(() => {
  "use strict";
  const STORAGE_KEY = "stockwise.inventory.v1";
  const $ = id => document.getElementById(id);
  const today = () => new Date().toISOString().slice(0, 10);
  const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  
  let state = { products: [], movements: [] };
  let activeTab = "overview", activeFilter = "all", searchText = "", editingProductId = null;

  const colourMap = { white:"#f5f5f5", blue:"#2f65d5", green:"#269b71", yellow:"#f4cc38", pink:"#e78bb4", red:"#df4949", black:"#242424", cyan:"#36b9d4", magenta:"#c744a0", orange:"#f08b37", "light blue":"#7bb6e8", "dark blue":"#234a83" };
  function colourValue(name) { return colourMap[String(name || "").trim().toLowerCase()] || "#b9c0cc"; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"'"}[c])); }
  function dateLabel(date) { if (!date) return "Never"; const d = new Date(date + "T12:00:00"); return Number.isNaN(+d) ? "Never" : d.toLocaleDateString("en-ZA",{day:"2-digit",month:"short",year:"numeric"}); }
  
  // Real-time calculated formula metrics
  function current(v) { return Math.max(0, Number(v.startingStock || v) + Number(v.stockIn || +v) - Number(v.stockOut || -v)); }
  
  function allVariants() { 
    return state.products.flatMap(p => (p.variants || []).map(v => ({
      ...v, 
      productId: p.id, 
      productName: p.name, 
      sku: p.sku || "", 
      category: p.category || "", 
      notes: p.notes || "", 
      current: current(v)
    }))); 
  }
  
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { showNotice("Could not save to browser storage.", true); } }
  
  function showNotice(message, isError=false) { 
    const el=$("notice"); 
    if(!el) return; 
    el.textContent=message; 
    el.classList.toggle("error", isError); 
    el.classList.remove("hidden"); 
    window.clearTimeout(showNotice.timer); 
    showNotice.timer=window.setTimeout(() => el.classList.add("hidden"), 5000); 
  }
  
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.products) && Array.isArray(parsed.movements)) state = parsed;
      }
    } catch { showNotice("Saved data corrupted. Please import a backup.", true); }
    render();
  }

  function visibleVariants() {
    const q = searchText.trim().toLowerCase();
    return allVariants().filter(v => {
      const matches = !q || [v.productName, v.sku, v.size, v.colour, v.category].join(" ").toLowerCase().includes(q);
      const low = v.current <= Number(v.minimumStock || 0);
      return matches && (activeFilter === "all" || (activeFilter === "low" && low) || (activeFilter === "healthy" && !low));
    });
  }

  function render() {
    const variants = allVariants(), low = variants.filter(v => v.current <= Number(v.minimumStock || 0));
    
    if ($("metric-products")) $("metric-products").textContent = state.products.length;
    if ($("metric-low")) {
      $("metric-low").textContent = low.length;
      $("metric-low").classList.toggle("warn-text", low.length > 0);
    }
    if ($("metric-today")) $("metric-today").textContent = state.movements.filter(m => m.date === today()).length;
    if ($("low-count")) $("low-count").textContent = low.length;
    if ($("low-alert")) $("low-alert").classList.toggle("hidden", !low.length || activeTab === "history");
    if ($("alert-title")) $("alert-title").textContent = `${low.length} variation${low.length === 1 ? "" : "s"} need attention`;
    if ($("alert-detail")) $("alert-detail").textContent = low.slice(0, 4).map(v => `${v.productName} · ${v.size} / ${v.colour}`).join(" • ") + (low.length > 4 ? ` • +${low.length - 4} more` : "");
    
    document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.tab === activeTab));
    if ($("crumb")) $("crumb").textContent = activeTab.toUpperCase();
    if ($("page-title")) $("page-title").textContent = activeTab === "overview" ? "Product inventory" : activeTab === "products" ? "Products & variants" : "Movement history";
    if ($("panel-title")) $("panel-title").textContent = activeTab === "history" ? "Stock movement ledger" : activeTab === "products" ? "Products & variants" : "Stock overview";
    if ($("panel-subtitle")) $("panel-subtitle").textContent = activeTab === "history" ? "A dated audit trail of stock in, stock out and physical counts." : activeTab === "products" ? "Add, edit, reorder or remove products and variations." : "All product variations and current quantities.";
    
    if ($("history-panel")) $("history-panel").classList.toggle("hidden", activeTab !== "history");
    const invTable = $("#inventory-table");
    if (invTable) invTable.closest(".panel").classList.toggle("hidden", activeTab === "history");
    if ($("filters")) $("filters").classList.toggle("hidden", activeTab === "history");
    
    renderInventory(); 
    renderHistory();
  }

  function renderInventory() {
    const rows = visibleVariants();
    const body = $("inventory-body");
    if (!body) return;

    body.innerHTML = rows.length ? rows.map(v => {
      const isLow = v.current <= Number(v.minimumStock || 0);
      const isOut = v.current <= 0;
      
      let statusTag = '<span class="status-tag stable" style="background:#269b71;color:#fff;padding:2px 6px;border-radius:4px;font-size:11px;">In Stock</span>';
      if (isOut) {
        statusTag = '<span class="status-tag critical" style="background:#df4949;color:#fff;padding:2px 6px;border-radius:4px;font-size:11px;">Out of Stock</span>';
      } else if (isLow) {
        statusTag = '<span class="status-tag warning" style="background:#f4cc38;color:#242424;padding:2px 6px;border-radius:4px;font-size:11px;">Low Stock</span>';
      }

      return `<tr>
        <td><button class="table-edit-button" data-action="edit" data-id="${v.productId}" title="Edit product">✎</button></td>
        <td><strong>${escapeHtml(v.productName)}</strong><small class="cell-sub">${v.sku ? `SKU: ${escapeHtml(v.sku)}` : "No SKU"}${v.category ? ` · ${escapeHtml(v.category)}` : ""}</small></td>
        <td>${escapeHtml(v.size || "Standard")}</td>
        <td><span class="colour-chip"><i class="colour-dot" style="background:${colourValue(v.colour)}"></i>${escapeHtml(v.colour || "Standard")}</span></td>
        <td><strong class="stock-number">${v.current}</strong></td>
        <td>${Number(v.minimumStock || 0)}</td>
        <td>${statusTag}</td>
        <td><button class="table-movement-button action-in" data-action="in" data-id="${v.id}" data-name="${escapeHtml(v.productName)}">+ In</button><small class="cell-sub" style="display:block;color:#666;font-size:10px;">Total: ${Number(v.stockIn || 0)}</small></td>
        <td><button class="table-movement-button action-out" data-action="out" data-id="${v.id}" data-name="${escapeHtml(v.productName)}">- Out</button><small class="cell-sub" style="display:block;color:#666;font-size:10px;">Total: ${Number(v.stockOut || 0)}</small></td>
        <td>${dateLabel(v.lastRestocked)}</td>
        <td>${dateLabel(v.lastStockTake)}</td>
        <td>
          <div class="actions" style="display:flex;gap:4px;">
            <button class="icon-action" data-action="take" data-id="${v.id}" data-name="${escapeHtml(v.productName)}" title="Stock take">✓</button>
            <button class="icon-action" data-action="delete" data-id="${v.productId}" title="Delete product">×</button>
          </div>
        </td>
      </tr>`;
    }).join("") : `<tr><td colspan="12" class="empty">No variations match your search or filter.</td></tr>`;
    
    if ($("row-count")) $("row-count").textContent = `${rows.length} variation${rows.length === 1 ? "" : "s"}`;
  }

  function renderHistory() {
    const body = $("history-body");
    if (!body) return;
    const q = searchText.toLowerCase().trim();
    const sorted = state.movements.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const filtered = sorted.filter(m => !q || [m.type, m.quantity.toString(), m.date, m.note || ""].join(" ").toLowerCase().includes(q));

    body.innerHTML = filtered.length ? filtered.map(m => {
      const typeBadge = m.type === "in" ? '<span style="color:#269b71;font-weight:600;">RESTOCK (+)</span>' : m.type === "out" ? '<span style="color:#df4949;font-weight:600;">STOCK OUT (-)</span>' : '<span style="color:#2f65d5;font-weight:600;">STOCK TAKE (≡)</span>';
      return `<tr>
        <td>${dateLabel(m.date)}</td>
        <td>${escapeHtml(m.productName || "Unknown Product")}</td>
        <td>${typeBadge}</td>
        <td><strong>${m.quantity}</strong></td>
        <td><small style="color:#555;">${escapeHtml(m.note || "No comments")}</small></td>
      </tr>`;
    }).join("") : `<tr><td colspan="5" class="empty">No audit ledger transactions recorded.</td></tr>`;
    if($("history-count")) $("history-count").textContent = `${filtered.length} movement${filtered.length===1?"":"s"}`;
  }

  function openProductModal(prodId = null) {
    editingProductId = prodId;
    const dialog = $("product-dialog");
    const form = $("product-form");
    if (!dialog || !form) return;
    form.reset();
    
    if (prodId) {
      $("product-dialog-title").textContent = "Edit Product";
      const p = state.products.find(item => item.id === prodId);
      if (p) {
        $("name").value = p.name;
        $("sku").value = p.sku || "";
        $("category").value = p.category || "";
        if(p.variants && p.variants[0]) {
          $("size").value = p.variants[0].size;
          $("colour").value = p.variants[0].colour;
          $("starting-stock").value = p.variants[0].startingStock;
          $("minimum-stock").value = p.variants[0].minimumStock;
        }
        $("notes").value = p.notes || "";
      }
