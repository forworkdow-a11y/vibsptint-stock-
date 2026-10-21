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
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function dateLabel(date) { if (!date) return "Never"; const d = new Date(date + "T12:00:00"); return Number.isNaN(+d) ? "Never" : d.toLocaleDateString("en-ZA",{day:"2-digit",month:"short",year:"numeric"}); }
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
  function renderInventory() {
    const rows=visibleVariants();
    $("inventory-body").innerHTML=rows.length?rows.map(v=>{
      const low=v.current<=Number(v.minimumStock||0);
      return `<tr>
        <td><button class="table-edit-button" data-action="edit" data-id="${v.id}" title="Edit product" aria-label="Edit ${escapeHtml(v.productName)}">✎</button></td>
        <td><strong>${escapeHtml(v.productName)}</strong><small class="cell-sub">${v.sku?`SKU: ${escapeHtml(v.sku)}`:"No SKU"}${v.category?` · ${escapeHtml(v.category)}`:""}</small></td>
        <td>${escapeHtml(v.size||"Standard")}</td>
        <td><span class="colour-chip"><i class="colour-dot" style="background:${colourValue(v.colour)}"></i>${escapeHtml(v.colour||"Standard")}</span></td>
        <td><strong class="stock-number">${v.current}</strong>${low?'<span class="low-tag">LOW</span>':""}</td>
        <td>${Number(v.minimumStock||0)}</td>
        <td><button class="table-movement-button action-in" data-action="in" data-id="${v.id}" title="Stock in">＋ In</button><small class="cell-sub">Total: ${Number(v.stockIn||0)}</small></td>
        <td><button class="table-movement-button action-out" data-action="out" data-id="${v.id}" title="Stock out">− Out</button><small class="cell-sub">Total: ${Number(v.stockOut||0)}</small></td>
        <td>${dateLabel(v.lastRestocked)}</td><td>${dateLabel(v.lastStockTake)}</td>
        <td><div class="actions"><button class="icon-action" data-action="take" data-id="${v.id}" title="Stock take">✓</button><button class="icon-action" data-action="up" data-id="${v.productId}" title="Move product up">↑</button><button class="icon-action" data-action="down" data-id="${v.productId}" title="Move product down">↓</button><button class="icon-action" data-action="delete" data-id="${v.productId}" title="Delete product">×</button></div></td>
      </tr>`;
    }).join(""):`<tr><td colspan="11" class="empty">${state.products.length?"No variations match your search or filter.":"No products yet. Select the + button to add your first product."}</td></tr>`;
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
    $("starting-stock").disabled=!!product; // Existing balances change through stock movements, not edits.
    $("product-dialog").showModal();
  }
  function findVariant(id) { for(const p of state.products){const v=(p.variants||[]).find(v=>v.id===id);if(v)return {product:p,variant:v};} return null; }
  function openMovement(v,type) {
    $("movement-form").reset(); $("movement-error").classList.add("hidden");
    $("movement-variant-id").value=v.id; $("movement-type").value=type;
    $("movement-title").textContent=type==="in"?"Stock in":"Stock out";
    $("movement-product").textContent=`${v.productName} · ${v.size} / ${v.colour} · Current stock: ${v.current}`;
    $("movement-quantity").value=""; $("movement-dialog").showModal();
  }
  const q = Number(quantity);
if (!Number.isInteger(q) || q < 1) throw new Error("Enter a whole number greater than zero.");

// 1. Calculate current inventory on the fly or read it from the object
const currentInventory = v.quantity || 0; 

if (type === "out" && q > currentInventory) {
  throw new Error(`Not enough stock. Available quantity: ${currentInventory}.`);
}

if (type === "in") {
  v.stockIn = Number(v.stockIn || 0) + q;
  v.quantity = (v.quantity || 0) + q; // <-- Add to current stock
  v.lastRestocked = today();
}

if (type === "out") {
  v.stockOut = Number(v.stockOut || 0) + q;
  v.quantity = (v.quantity || 0) - q; // <-- Take out from current stock
}

state.movements.push({
  id: makeId(),
  productId: v.productId,
  productName: v.productName,
  variantId: v.id,
  size: v.size,
  type: type,      // Added for clear logging
  quantity: q,     // Added for clear logging
  timestamp: today()
});

save();
render();
  }
  function download(name,content,type) {
    const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }
  function exportCsv() {
    const rows=[["Product","SKU","Category","Size","Colour","Starting stock","Stock in total","Stock out total","Current stock","Minimum stock","Last restocked","Last stock take","Notes"]];
    allVariants().forEach(v=>rows.push([v.productName,v.sku,v.category,v.size,v.colour,v.startingStock,v.stockIn,v.stockOut,v.current,v.minimumStock,v.lastRestocked||"",v.lastStockTake||"",v.notes]));
    const csv=rows.map(r=>r.map(x=>`"${String(x??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
    download(`stockwise-inventory-${today()}.csv`,"\ufeff"+csv,"text/csv;charset=utf-8");
  }
  function moveProduct(id,direction) {
    const i=state.products.findIndex(p=>p.id===id),j=i+(direction==="up"?-1:1);
    if(i<0||j<0||j>=state.products.length)return;
    [state.products[i],state.products[j]]=[state.products[j],state.products[i]];save();render();
  }

  document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>{activeTab=b.dataset.tab;render();}));
  $("add-product").addEventListener("click",()=>openProduct());
  $("review-low").addEventListener("click",()=>{activeTab="overview";activeFilter="low";document.querySelectorAll("[data-filter]").forEach(b=>b.classList.toggle("selected",b.dataset.filter==="low"));render();});
  $("search").addEventListener("input",e=>{searchText=e.target.value;renderInventory();renderHistory();});
  document.querySelectorAll("[data-filter]").forEach(b=>b.addEventListener("click",()=>{activeFilter=b.dataset.filter;document.querySelectorAll("[data-filter]").forEach(x=>x.classList.toggle("selected",x===b));renderInventory();}));
  document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.close).close()));
  $("inventory-body").addEventListener("click",e=>{
    const b=e.target.closest("button[data-action]");if(!b)return;const {action,id}=b.dataset;
    if(action==="edit"){const found=findVariant(id);if(found)openProduct(found.product,found.variant);}
    if(action==="in"||action==="out"){const v=allVariants().find(x=>x.id===id);if(v)openMovement(v,action);}
    if(action==="take"){const v=allVariants().find(x=>x.id===id);if(v){$("stocktake-form").reset();$("stocktake-error").classList.add("hidden");$("stocktake-variant-id").value=v.id;$("stocktake-product").textContent=`${v.productName} · ${v.size} / ${v.colour} · Current stock: ${v.current}`;$("stocktake-quantity").value=v.current;$("stocktake-dialog").showModal();}}
    if(action==="up"||action==="down")moveProduct(id,action);
    if(action==="delete"){const p=state.products.find(x=>x.id===id);if(p){deleteProductId=id;$("confirm-message").textContent=`${p.name} and all its variations will be removed.`;$("confirm-dialog").showModal();}}
  });
  $("product-form").addEventListener("submit",e=>{
    e.preventDefault();const error=$("product-form-error");error.classList.add("hidden");
    const name=$("name").value.trim(),size=$("size").value.trim(),colour=$("colour").value.trim(),startingStock=Number($("starting-stock").value),minimumStock=Number($("minimum-stock").value);
    if(!name||!size||!colour){error.textContent="Product name, size and colour are required.";error.classList.remove("hidden");return;}
    if(!Number.isInteger(startingStock)||startingStock<0||!Number.isInteger(minimumStock)||minimumStock<0){error.textContent="Stock values must be whole numbers of zero or more.";error.classList.remove("hidden");return;}
    const productId=$("product-id").value,form={name,sku:$("sku").value.trim(),category:$("category").value.trim(),notes:$("notes").value.trim()};
    if(productId){
      const p=state.products.find(p=>p.id===productId);if(!p)return;
      const variant=p.variants.find(v=>v.id===editingVariantId);
      p.name=form.name;p.sku=form.sku;p.category=form.category;p.notes=form.notes;
      if(variant){variant.size=size;variant.colour=colour;variant.minimumStock=minimumStock;}
      state.movements.forEach(m=>{if(m.productId===p.id)m.productName=p.name;});
    } else {
      state.products.push({...form,id:makeId(),createdAt:new Date().toISOString(),variants:[{id:makeId(),size,colour,startingStock,minimumStock,stockIn:0,stockOut:0,lastRestocked:null,lastStockTake:null}]});
    }
    save();$("product-dialog").close();render();showNotice(productId?"Product updated.":"Product added.");
  });
  let editingVariantId=null;
  const openProductOriginal=openProduct;
  openProduct=function(product=null,variant=null){editingVariantId=variant?.id||null;openProductOriginal(product,variant);};
  $("movement-form").addEventListener("submit",e=>{
    e.preventDefault();const found=findVariant($("movement-variant-id").value);if(!found)return;
    try{recordMovement({...found.variant,productId:found.product.id,productName:found.product.name,current:current(found.variant)},$("movement-type").value,$("movement-quantity").value,$("movement-note").value.trim());$("movement-dialog").close();showNotice("Stock movement recorded.");}
    catch(err){$("movement-error").textContent=err.message||"Could not record movement.";$("movement-error").classList.remove("hidden");}
  });
  $("stocktake-form").addEventListener("submit",e=>{
    e.preventDefault();const found=findVariant($("stocktake-variant-id").value);if(!found)return;const actual=Number($("stocktake-quantity").value);
    if(!Number.isInteger(actual)||actual<0){$("stocktake-error").textContent="Count must be a whole number of zero or more.";$("stocktake-error").classList.remove("hidden");return;}
    const v=found.variant,previous=current(v),delta=actual-previous;
    // Adjust the opening balance by the count difference, preserving lifetime stock-in/out totals.
    v.startingStock=Number(v.startingStock||0)+delta;v.lastStockTake=today();
    state.movements.push({id:makeId(),productId:found.product.id,productName:found.product.name,variantId:v.id,size:v.size,colour:v.colour,type:"take",quantity:actual,date:today(),note:$("stocktake-note").value.trim()||`Physical count (difference ${delta>=0?"+":""}${delta})`,createdAt:new Date().toISOString()});
    save();$("stocktake-dialog").close();render();showNotice("Physical stock count saved.");
  });
  $("confirm-delete").addEventListener("click",()=>{if(!deleteProductId)return;const p=state.products.find(p=>p.id===deleteProductId);state.products=state.products.filter(p=>p.id!==deleteProductId);state.movements=state.movements.filter(m=>m.productId!==deleteProductId);deleteProductId=null;save();$("confirm-dialog").close();render();showNotice(`Deleted ${p?.name||"product"}.`);});
  $("export-csv").addEventListener("click",exportCsv);
  $("export-backup").addEventListener("click",()=>download(`stockwise-backup-${today()}.json`,JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2),"application/json"));
  $("import-backup").addEventListener("change",async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{const parsed=JSON.parse(await file.text());if(!Array.isArray(parsed.products)||!Array.isArray(parsed.movements))throw new Error("This file is not a StockWise backup.");if(!confirm("Importing replaces the inventory saved in this browser. Continue?"))return;state={products:parsed.products,movements:parsed.movements};save();render();showNotice("Inventory backup imported.");}
    catch(err){showNotice(err.message||"Could not import backup.",true);}finally{e.target.value="";}
  });
  $("clear-search").addEventListener("click",()=>{$("search").value="";searchText="";renderHistory();});
  load();
})();
