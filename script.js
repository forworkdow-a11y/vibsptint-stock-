(() => {
  "use strict";
  const STORAGE_KEY = "stockwise.inventory.v1";
  const $ = id => document.getElementById(id);
  const today = () => new Date().toISOString().slice(0, 10);
  const makeId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  let state = { products: [], movements: [] };
  let activeTab = "overview", activeFilter = "all", searchText = "", deleteProductId = null;

  const colourMap = { white:"#f5f5f5", blue:"#2f65d5", green:"#269b71", yellow:"#f4cc38", pink:"#e78bb4", red:"#df4949", black:"#242424", cyan:"#36b9d4", magenta:"#c744a0", orange:"#f08b37", "light blue":"#7bb6e8", "dark blue":"#234a83" };
  function colourValue(name) { return colourMap[String(name || "").trim().toLowerCase()] || "#b9c0cc"; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"'"}[c])); }
  function dateLabel(date) { if (!date) return "Never"; const d = new Date(date + "T12:00:00"); return Number.isNaN(+d) ? "Never" : d.toLocaleDateString("en-ZA",{day:"2-digit",month:"short",year:"numeric"}); }
  
  // Dynamic formula calculations
  function current(v) { return Math.max(0, Number(v.startingStock || 0) + Number(v.stockIn || 0) - Number(v.stockOut || 0)); }
  function allVariants() { return state.products.flatMap(p => (p.variants || []).map(v => ({...v, productId:p.id, productName:p.name, sku:p.sku || "", category:p.category || "", notes:p.notes || "", current:current(v)}))); }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { showNotice("Could not save to this browser. Check available storage space.", true); } }
  function showNotice(message, isError=false) { const el=$("notice"); el.textContent=message; el.classList.toggle("error",isError); el.classList.remove("hidden"); window.clearTimeout(showNotice.timer); showNotice.timer=window.setTimeout(()=>el.classList.add("hidden"),5000); }
  
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.products) && Array.isArray(parsed.movements)) state = parsed;
      }
    } catch { showNotice("Saved inventory could not be read. Import a JSON backup if you have one.", true); }
    render();
  }

  function visibleVariants() {
    const q=searchText.trim().toLowerCase();
    return allVariants().filter(v => {
      const matches=!q || [v.productName,v.sku,v.size,v.colour,v.category].join(" ").toLowerCase().includes(q);
      const low=v.current<=Number(v.minimumStock || 0);
      return matches && (activeFilter==="all" || (activeFilter==="low" && low) || (activeFilter==="healthy" && !low));
    });
  }

  function render() {
    const variants=allVariants(), low=variants.filter(v=>v.current<=Number(v.minimumStock || 0));
    $("metric-products").textContent=state.products.length;
    $("metric-low").textContent=low.length;
    $("metric-low").classList.toggle("warn-text",low.length>0);
    $("metric-today").textContent=state.movements.filter(m=>m.date===today()).length;
    $("low-count").textContent=low.length;
    $("low-alert").classList.toggle("hidden",!low.length || activeTab==="history");
    $("alert-title").textContent=`${low.length} variation${low.length===1?"":"s"} need attention`;
    $("alert-detail").textContent=low.slice(0,4).map(v=>`${v.productName} · ${v.size} / ${v.colour}`).join(" • ")+(low.length>4?` • +${low.length-4} more`:"");
    document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.tab===activeTab));
    $("crumb").textContent=activeTab.toUpperCase();
    $("page-title").textContent=activeTab==="overview"?"Product inventory":activeTab==="products"?"Products & variants":"Movement history";
    $("panel-title").textContent=activeTab==="history"?"Stock movement ledger":activeTab==="products"?"Products & variants":"Stock overview";
    $("panel-subtitle").textContent=activeTab==="history"?"A dated audit trail of stock in, stock out and physical counts.":activeTab==="products"?"Add, edit, reorder or remove products and variations.":"All product variations and current quantities.";
    $("history-panel").classList.toggle("hidden",activeTab!=="history");
    document.querySelector("#inventory-table").closest(".panel").classList.toggle("hidden",activeTab==="history");
    $("filters").classList.toggle("hidden",activeTab==="history");
    $("search").placeholder=activeTab==="history"?"Search movement history":"Search product, SKU, size or colour";
    renderInventory(); renderHistory();
  }

  // Matches the complete 13 column arrangement
  function renderInventory() {
    const rows=visibleVariants();
    $("inventory-body").innerHTML=rows.length?rows.map(v=>{
      const isLow = v.current <= Number(v.minimumStock || 0);
      const isOut = v.current <= 0;
      
      let statusTag = '<span class="status-tag stable" style="background:#269b71;color:#fff;padding:2px 6px;border-radius:4px;font-size:11px;">In Stock</span>';
      if (isOut) {
        statusTag = '<span class="status-tag critical" style="background:#df4949;color:#fff;padding:2px 6px;border-radius:4px;font-size:11px;">Out of Stock</span>';
      } else if (isLow) {
        statusTag = '<span class="status-tag warning" style="background:#f4cc38;color:#242424;padding:2px 6px;border-radius:4px;font-size:11px;">Low Stock</span>';
      }

      return `<tr>
        <td><button class="table-edit-button" data-action="edit" data-id="${v.id}" title="Edit product">✎</button></td>
        <td><strong>${escapeHtml(v.productName)}</strong><small class="cell-sub">${v.sku?`SKU: ${escapeHtml(v.sku)}`:"No SKU"}${v.category?` · ${escapeHtml(v.category)}`:""}</small></td>
        <td>${escapeHtml(v.size||"Standard")}</td>
        <td><span class="colour-chip"><i class="colour-dot" style="background:${colourValue(v.colour)}"></i>${escapeHtml(v.colour||"Standard")}</span></td>
        <td><strong class="stock-number">${v.current}</strong></td>
        <td>${Number(v.minimumStock||0)}</td>
        <td>${statusTag}</td>
        <td><button class="table-movement-button action-add" data-action="product-add" style="background:#f5f5f5;border:1px solid #ccc;padding:4px 8px;border-radius:4px;cursor:pointer;">＋ Add Stock</button></td>
        <td><button class="table-movement-button action-in" data-action="in" data-id="${v.id}" style="background:#269b71;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;">＋ Restock</button><small class="cell-sub" style="display:block;color:#666;font-size:10px;">Total: ${Number(v.stockIn||0)}</small></td>
        <td><button class="table-movement-button action-out" data-action="out" data-id="${v.id}" style="background:#df4949;color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;">− Stock out</button><small class="cell-sub" style="display:block;color:#666;font-size:10px;">Total: ${Number(v.stockOut||0)}</small></td>
        <td>${dateLabel(v.lastRestocked)}</td>
        <td>${dateLabel(v.lastStockTake)}</td>
        <td><div class="actions" style="display:flex;gap:4px;"><button class="icon-action" data-action="take" data-id="${v.id}" title="Stock take">✓</button><button class="icon-action" data-action="up" data-id="${v.productId}">↑</button><button class="icon-action" data-action="down" data-id="${v.productId}">↓</button><button class="icon-action" data-action="delete" data-id="${v.productId}">×</button></div></td>
      </tr>`;
    }).join(""):`<tr><td colspan="13" class="empty">No variations match your search or filter.</td></tr>`;
    $("row-count").textContent=`${rows.length} variation${rows.length===1?"":"s"}`;
  }

  function renderHistory() {
    const q=searchText.toLowerCase().trim();
    const list=state.movements.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"") || (b.createdAt||"").localeCompare(a.createdAt||"")).filter(m=>!q||[m.productName,m.size,m.colour,m.type,m.note].join(" ").toLowerCase().includes(q));
    $("history-body").innerHTML=list.length?list.map(m=>`<tr><td>${dateLabel(m.date)}</td><td><strong>${escapeHtml(m.productName)}</strong><small class="cell-sub">${escapeHtml(m.size)} / ${escapeHtml(m.colour)}</small></td><td><span class="pill ${m.type==="in"?"pill-green":m.type==="out"?"pill-red":"pill-blue"}">${m.type==="in"?"Stock in":m.type==="out"?"Stock out":"Stock take"}</span></td><td class="qty">${m.type==="take"?`Counted: ${m.quantity}`:`${m.type==="in"?"+":"−"}${m.quantity}`}</td><td>${escapeHtml(m.note||"")}</td></tr>`).join(""):`<tr><td colspan="5" class="empty">No movement records yet.</td></tr>`;
    $("history-count").textContent=`${list.length} movement${list.length===1?"":"s"}`;
  }

  function openProduct(product=null, variant=null) {
    $("product-form").reset(); $("product-form-error").classList.add("hidden");
    $("product-dialog-title").textContent=product?"Edit product":"Add product";
    $("product-id").value=product?.id||"";
    $("name").value=product?.name||""; $("sku").value=product?.sku||""; $("category").value=product?.category||""; $("notes").value=product?.notes||"";
    $("size").value=variant?.size||"Standard"; $("colour").value=variant?.colour||"";
    $("starting-stock").value=variant?.startingStock??0; $("minimum-stock").value=variant?.minimumStock??5;
    $("starting-stock").disabled=!!product;
    $("product-dialog").showModal();
  }

  function findVariant(id) { for(const p of state.products){const v=(p.variants||[]).find(v=>v.id===id);if(v)return {product:p,variant:v};} return null; }
  
  function openMovement(v,type) {
    $("movement-form").reset(); $("movement-error").classList.add("hidden");
    $("movement-variant-id").value=v.id; $("movement-type").value=type;
    $("movement-title").textContent=type==="in"?"Restock Items":"Stock Out Items";
